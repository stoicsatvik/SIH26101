import {
  COURSE_CATALOG,
  FIELD_ENUMERATOR_ROLE,
  resolveRole,
  scoreAssessmentRows,
} from './assessment-engine.js';
import { CURATED_FIELD_ENUMERATOR_QUESTIONS } from './resilient-assessment.js';

const CACHE_LOOKBACK = 100;

function randomHex(bytes = 5) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function flattenRole(role = FIELD_ENUMERATOR_ROLE) {
  return role.competencies.flatMap((competency) => competency.subCompetencies.map((sub) => ({
    competencyId: competency.competencyId,
    subCompetencyId: sub.id,
  })));
}

export function expectedCoverageKeys(role = FIELD_ENUMERATOR_ROLE) {
  return flattenRole(role).map((item) => `${item.competencyId}/${item.subCompetencyId}`);
}

export function hasCompleteRoleCoverage(rows = [], role = FIELD_ENUMERATOR_ROLE) {
  const expected = new Set(expectedCoverageKeys(role));
  const found = new Set();
  for (const row of rows) {
    const competencyId = String(row.competency_id || row.competencyId || '');
    const subCompetencyId = String(row.sub_competency_id || row.subCompetencyId || '');
    const key = `${competencyId}/${subCompetencyId}`;
    if (expected.has(key)) found.add(key);
  }
  return found.size === expected.size;
}

function normalizeOptions(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function persistQuestionCopies(sql, questions, sourceRef, sourceType, reason) {
  const stamp = Date.now();
  const rows = questions.map((question, index) => {
    const questionId = `${String(question.subCompetencyId || question.sub_competency_id)}-${stamp}-${String(index + 1).padStart(2, '0')}-${randomHex(2)}`;
    const options = normalizeOptions(question.options ?? question.options_json);
    return {
      questionId,
      competencyId: String(question.competencyId || question.competency_id),
      subCompetencyId: String(question.subCompetencyId || question.sub_competency_id),
      questionText: String(question.questionText || question.question_text),
      options,
      correctOption: String(question.correctOption || question.correct_option).toUpperCase(),
      explanation: question.explanation || null,
      difficulty: question.difficulty || 'developing',
      validationStatus: String(question.validationStatus || question.validation_status || 'needs_review'),
      semanticSimilarity: question.semanticSimilarity ?? question.semantic_similarity ?? null,
    };
  });

  for (let offset = 0; offset < rows.length; offset += 5) {
    const batch = rows.slice(offset, offset + 5);
    await Promise.all(batch.map((question) => {
      const optionsJson = JSON.stringify(question.options);
      return sql`
        INSERT INTO question_bank (
          question_id, competency_id, sub_competency_id, question_text, options_json,
          correct_option, explanation, difficulty, source_type, source_ref,
          validation_status, semantic_similarity, validation_reason, updated_at
        ) VALUES (
          ${question.questionId}, ${question.competencyId}, ${question.subCompetencyId}, ${question.questionText}, ${optionsJson}::jsonb,
          ${question.correctOption}, ${question.explanation}, ${question.difficulty}, ${sourceType}, ${sourceRef},
          ${question.validationStatus}, ${question.semanticSimilarity}, ${reason}, now()
        )
      `;
    }));
  }

  return rows;
}

function publicAssessment(sourceRef, role, persisted, generationMode, validationMode) {
  return {
    assessmentId: sourceRef,
    role: { id: role.roleId, name: role.roleName },
    questionCount: persisted.length,
    generationMode,
    validationMode,
    validatedCount: persisted.filter((question) => question.validationStatus === 'validated').length,
    questions: persisted.map((question) => ({
      questionId: question.questionId,
      competencyId: question.competencyId,
      subCompetencyId: question.subCompetencyId,
      question: question.questionText,
      options: question.options,
      difficulty: question.difficulty,
      validation: {
        status: question.validationStatus,
        similarity: question.semanticSimilarity == null ? null : Number(question.semanticSimilarity),
        expectedRank: null,
      },
    })),
  };
}

function curatedRows() {
  return CURATED_FIELD_ENUMERATOR_QUESTIONS.map((question) => ({
    questionId: `curated-${question.subCompetencyId}`,
    question_id: `curated-${question.subCompetencyId}`,
    competencyId: question.competencyId,
    competency_id: question.competencyId,
    subCompetencyId: question.subCompetencyId,
    sub_competency_id: question.subCompetencyId,
    questionText: question.questionText,
    options: [...question.options],
    correctOption: question.correctOption,
    correct_option: question.correctOption,
    explanation: question.explanation,
    difficulty: question.difficulty,
    validationStatus: 'needs_review',
    semanticSimilarity: null,
  }));
}

export async function createInstantCuratedAssessment(_sql, userId, profile = {}, mode = 'instant-demo') {
  const role = resolveRole(profile);
  const sourceRef = `assessment:${userId}:${role.roleId}:${Date.now()}:instant-${mode}-${randomHex(3)}`;
  return publicAssessment(sourceRef, role, curatedRows(), mode, 'curated-structural');
}

function deterministicRecommendations(competencies) {
  const weakIds = [...competencies]
    .sort((a, b) => Number(a.scorePercentage) - Number(b.scorePercentage))
    .slice(0, 3)
    .map((item) => item.id);
  const courses = COURSE_CATALOG.map((course) => ({
    ...course,
    priority: course.competencyIds.filter((id) => weakIds.includes(id)).length,
  }))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(({ priority, ...course }) => course);
  return {
    courses,
    aiPersonalized: false,
    reason: 'Courses are ranked from your lowest competency scores using the controlled GyanSetu prototype catalog.',
  };
}

export async function submitInstantCuratedAssessment(sql, userId, body = {}) {
  const assessmentId = String(body.assessmentId || '');
  if (!assessmentId.startsWith(`assessment:${userId}:`) || !assessmentId.includes(':instant-')) {
    throw new Error('Assessment does not belong to the current user.');
  }
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const rows = curatedRows();
  if (answers.length !== rows.length) throw new Error('Answer every question before submitting the assessment.');

  const score = scoreAssessmentRows(rows, answers, FIELD_ENUMERATOR_ROLE);
  await Promise.all(score.competencies.map((competency) => {
    const storedLevel = Math.round((Number(competency.scorePercentage) / 20) * 100) / 100;
    return sql`
      INSERT INTO user_skills (user_id, skill_name, self_reported_level, source)
      VALUES (${userId}, ${competency.name}, ${storedLevel}, 'assessment')
      ON CONFLICT (user_id, skill_name, source)
      DO UPDATE SET self_reported_level = EXCLUDED.self_reported_level, created_at = now()
    `;
  }));

  return { ...score, recommendations: deterministicRecommendations(score.competencies) };
}

export async function createCachedAiAssessment(sql, userId, profile = {}) {
  const role = resolveRole(profile);
  const expected = new Set(expectedCoverageKeys(role));
  const recent = await sql`
    SELECT question_id, competency_id, sub_competency_id, question_text, options_json,
           correct_option, explanation, difficulty, validation_status, semantic_similarity, created_at
    FROM question_bank
    WHERE source_type = 'ai'
      AND source_ref IS NOT NULL
      AND source_ref NOT LIKE '%:cache-%'
    ORDER BY created_at DESC, id DESC
    LIMIT ${CACHE_LOOKBACK}
  `;

  const selected = new Map();
  for (const row of recent) {
    const key = `${row.competency_id}/${row.sub_competency_id}`;
    if (expected.has(key) && !selected.has(key)) selected.set(key, row);
  }
  const sourceRows = [...selected.values()];
  if (!hasCompleteRoleCoverage(sourceRows, role)) return null;

  const sourceRef = `assessment:${userId}:${role.roleId}:${Date.now()}:cache-${randomHex(3)}`;
  const persisted = await persistQuestionCopies(
    sql,
    sourceRows,
    sourceRef,
    'ai',
    'Reused from the GyanSetu AI question bank to avoid unnecessary repeated OpenRouter generation.',
  );
  return publicAssessment(sourceRef, role, persisted, 'cached-openrouter', 'cached-validation');
}

export async function countLiveAiAssessmentsToday(sql) {
  const rows = await sql`
    SELECT count(DISTINCT source_ref)::int AS count
    FROM question_bank
    WHERE source_type = 'ai'
      AND source_ref IS NOT NULL
      AND source_ref NOT LIKE '%:cache-%'
      AND created_at >= date_trunc('day', now())
  `;
  return Number(rows[0]?.count || 0);
}

export function dailyLiveAssessmentLimit(env = {}) {
  const value = Number(env.AI_LIVE_ASSESSMENTS_PER_DAY || 15);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 15;
}
