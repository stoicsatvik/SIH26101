import {
  embedTexts,
  embeddingModel,
  persistQuestionValidation,
  semanticThreshold,
  upsertCompetencyConcepts,
  vectorLiteral,
} from './semantic-validation.js';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_CHAT_MODEL = 'openrouter/free';
export const FRAMEWORK_VERSION = 'oss-demo-1.0';

export const FIELD_ENUMERATOR_ROLE = {
  roleId: 'field_enumerator',
  roleName: 'Field Enumerator',
  domain: 'Official Statistics - Field Operations',
  description: 'Collects, verifies, records, and reports statistical survey data while following field protocols, quality controls, and confidentiality requirements.',
  competencies: [
    {
      competencyId: 'survey_operations',
      name: 'Survey Operations',
      description: 'Ability to execute official survey fieldwork consistently and correctly.',
      requiredLevel: 3,
      subCompetencies: [
        { id: 'sampling_basics', name: 'Sampling Basics', definition: 'Understands why samples are selected, follows assigned sample units, and avoids unauthorized substitutions.', requiredLevel: 2 },
        { id: 'questionnaire_administration', name: 'Questionnaire Administration', definition: 'Administers questions consistently, follows prescribed wording and sequence, and records responses accurately.', requiredLevel: 3 },
        { id: 'field_protocols', name: 'Field Protocols', definition: 'Follows visit procedures, respondent-contact protocols, escalation rules, and supervisor instructions during fieldwork.', requiredLevel: 3 },
      ],
    },
    {
      competencyId: 'data_quality',
      name: 'Data Quality',
      description: 'Ability to recognize, prevent, and resolve common data-quality problems during collection.',
      requiredLevel: 3,
      subCompetencies: [
        { id: 'validation_consistency', name: 'Validation and Consistency', definition: 'Checks entries for completeness, logical consistency, plausible values, and internal contradictions before submission.', requiredLevel: 3 },
        { id: 'nonresponse_error_handling', name: 'Non-response and Error Handling', definition: 'Handles missing responses, refusals, unavailable respondents, and detected errors according to approved procedures rather than inventing data.', requiredLevel: 3 },
      ],
    },
    {
      competencyId: 'statistical_fundamentals',
      name: 'Statistical Fundamentals',
      description: 'Ability to understand the basic statistical meaning of the data being collected and summarized.',
      requiredLevel: 2,
      subCompetencies: [
        { id: 'descriptive_statistics', name: 'Descriptive Statistics', definition: 'Understands basic measures such as counts, percentages, averages, median, and simple distributions used to summarize survey data.', requiredLevel: 2 },
        { id: 'tables_charts_interpretation', name: 'Tables and Charts Interpretation', definition: 'Reads simple statistical tables and charts and draws conclusions that are supported by the displayed data.', requiredLevel: 2 },
      ],
    },
    {
      competencyId: 'digital_data_collection',
      name: 'Digital Data Collection',
      description: 'Ability to use digital collection tools safely and report fieldwork correctly.',
      requiredLevel: 3,
      subCompetencies: [
        { id: 'digital_survey_tools', name: 'Digital Survey Tools', definition: 'Uses mobile or web-based survey forms, validation prompts, synchronization, and basic troubleshooting correctly.', requiredLevel: 3 },
        { id: 'data_confidentiality', name: 'Data Confidentiality', definition: 'Protects respondent information, devices, credentials, and collected data from unauthorized access or disclosure.', requiredLevel: 3 },
        { id: 'reporting_documentation', name: 'Reporting and Documentation', definition: 'Maintains clear field notes, records exceptions, and communicates progress or issues accurately to supervisors.', requiredLevel: 3 },
      ],
    },
  ],
};

export const COURSE_CATALOG = [
  { id: 'GS-C101', title: 'Survey Methodology for Field Investigators', provider: 'iGOT Karmayogi - Prototype Catalog', duration: '3h 20m', level: 'Foundation', competencyIds: ['survey_operations'] },
  { id: 'GS-C102', title: 'Improving Data Quality in Official Surveys', provider: 'iGOT Karmayogi - Prototype Catalog', duration: '2h 40m', level: 'Intermediate', competencyIds: ['data_quality'] },
  { id: 'GS-C103', title: 'Statistics Essentials for Government Data', provider: 'iGOT Karmayogi - Prototype Catalog', duration: '4h 10m', level: 'Foundation', competencyIds: ['statistical_fundamentals'] },
  { id: 'GS-C104', title: 'Digital Data Collection and CAPI Practices', provider: 'iGOT Karmayogi - Prototype Catalog', duration: '2h 15m', level: 'Intermediate', competencyIds: ['digital_data_collection'] },
  { id: 'GS-C105', title: 'Confidentiality and Responsible Handling of Statistical Data', provider: 'iGOT Karmayogi - Prototype Catalog', duration: '1h 30m', level: 'Foundation', competencyIds: ['digital_data_collection', 'data_quality'] },
  { id: 'GS-C106', title: 'From Field Data to Statistical Tables', provider: 'iGOT Karmayogi - Prototype Catalog', duration: '3h 00m', level: 'Intermediate', competencyIds: ['statistical_fundamentals', 'data_quality'] },
];

function randomHex(bytes = 10) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function flattenRole(role) {
  return role.competencies.flatMap((competency) => competency.subCompetencies.map((sub) => ({
    competencyId: competency.competencyId,
    competencyName: competency.name,
    competencyDescription: competency.description,
    competencyRequiredLevel: competency.requiredLevel,
    subCompetencyId: sub.id,
    subCompetencyName: sub.name,
    definition: sub.definition,
    requiredLevel: sub.requiredLevel,
  })));
}

export function questionCountForRole(role = FIELD_ENUMERATOR_ROLE) {
  const count = flattenRole(role).length;
  return Math.ceil(count / 10) * 10;
}

export function resolveRole(profile = {}) {
  const designation = String(profile.designation || profile.current_job_title || '').toLowerCase();
  if (designation.includes('enumerator') || designation.includes('field')) return FIELD_ENUMERATOR_ROLE;
  return FIELD_ENUMERATOR_ROLE;
}

function questionSchema(questionCount) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: questionCount,
        maxItems: questionCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['competency_id', 'sub_competency_id', 'question', 'options', 'correct_option', 'explanation', 'difficulty'],
          properties: {
            competency_id: { type: 'string' },
            sub_competency_id: { type: 'string' },
            question: { type: 'string', minLength: 20 },
            options: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: { type: 'string', minLength: 1 },
            },
            correct_option: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
            explanation: { type: 'string', minLength: 10 },
            difficulty: { type: 'string', enum: ['basic', 'developing', 'proficient', 'advanced'] },
          },
        },
      },
    },
  };
}

function compactRoleForPrompt(role) {
  return {
    role_id: role.roleId,
    role_name: role.roleName,
    description: role.description,
    competencies: role.competencies.map((competency) => ({
      competency_id: competency.competencyId,
      name: competency.name,
      required_level: competency.requiredLevel,
      sub_competencies: competency.subCompetencies.map((sub) => ({
        sub_competency_id: sub.id,
        name: sub.name,
        definition: sub.definition,
        required_level: sub.requiredLevel,
      })),
    })),
  };
}

async function callOpenRouterJson(env, { system, user, schema, schemaName, temperature = 0.15 }, fetchImpl = fetch) {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured.');
  const response = await fetchImpl(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'http-referer': 'https://sih26101.stoicsolutions-in.workers.dev',
      'x-title': 'GyanSetu',
    },
    body: JSON.stringify({
      model: String(env.OPENROUTER_MODEL || DEFAULT_CHAT_MODEL),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: 7000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `OpenRouter request failed (${response.status}).`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('OpenRouter returned an empty structured response.');
  try { return JSON.parse(content); } catch { throw new Error('OpenRouter returned invalid JSON.'); }
}

export function validateGeneratedQuestions(raw, role = FIELD_ENUMERATOR_ROLE) {
  const expected = flattenRole(role);
  const questionCount = questionCountForRole(role);
  const questions = Array.isArray(raw?.questions) ? raw.questions : [];
  if (questions.length !== questionCount) throw new Error(`Expected exactly ${questionCount} generated questions.`);

  const allowed = new Map(expected.map((item) => [`${item.competencyId}/${item.subCompetencyId}`, item]));
  const coverage = new Map(expected.map((item) => [`${item.competencyId}/${item.subCompetencyId}`, 0]));
  const seenText = new Set();

  const normalized = questions.map((item, index) => {
    const competencyId = String(item.competency_id || '').trim();
    const subCompetencyId = String(item.sub_competency_id || '').trim();
    const key = `${competencyId}/${subCompetencyId}`;
    if (!allowed.has(key)) throw new Error(`Question ${index + 1} references an unknown competency mapping.`);

    const questionText = String(item.question || '').trim();
    if (questionText.length < 20) throw new Error(`Question ${index + 1} is too short.`);
    const fingerprint = questionText.toLowerCase().replace(/\s+/g, ' ');
    if (seenText.has(fingerprint)) throw new Error('Generated assessment contains duplicate questions.');
    seenText.add(fingerprint);

    const options = Array.isArray(item.options) ? item.options.map((option) => String(option || '').trim()) : [];
    if (options.length !== 4 || options.some((option) => !option) || new Set(options.map((value) => value.toLowerCase())).size !== 4) {
      throw new Error(`Question ${index + 1} must contain four distinct options.`);
    }
    const correctOption = String(item.correct_option || '').trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(correctOption)) throw new Error(`Question ${index + 1} has an invalid correct option.`);
    const explanation = String(item.explanation || '').trim();
    if (explanation.length < 10) throw new Error(`Question ${index + 1} requires an explanation.`);

    coverage.set(key, Number(coverage.get(key) || 0) + 1);
    return {
      competencyId,
      subCompetencyId,
      questionText,
      options,
      correctOption,
      explanation,
      difficulty: String(item.difficulty || 'developing').toLowerCase(),
    };
  });

  for (const [key, count] of coverage) {
    if (count !== 1) throw new Error(`Assessment coverage for ${key} must be exactly one question.`);
  }
  return normalized;
}

export async function generateQuestions(env, role = FIELD_ENUMERATOR_ROLE, fetchImpl = fetch) {
  const count = questionCountForRole(role);
  const prompt = compactRoleForPrompt(role);
  const raw = await callOpenRouterJson(env, {
    schemaName: 'gyansetu_baseline_assessment',
    schema: questionSchema(count),
    system: [
      'You create diagnostic MCQs for GyanSetu, an official-statistics capacity-building prototype.',
      'Create practical, role-relevant questions that test understanding and judgement rather than obscure trivia.',
      'Use only the competency IDs and sub-competency IDs supplied by the user.',
      'Generate exactly one question for every supplied sub-competency, exactly once.',
      'Each question must have exactly four plausible options and exactly one correct answer.',
      'Avoid trick questions, political content, personal data, and facts that require unstated local policy.',
      'Return only the JSON object required by the response schema.',
    ].join(' '),
    user: JSON.stringify({
      task: `Generate exactly ${count} baseline diagnostic questions.`,
      role: prompt,
      difficulty_guidance: 'Mostly developing/proficient, with a small number of basic questions. Match difficulty to required level.',
    }),
  }, fetchImpl);
  return validateGeneratedQuestions(raw, role);
}

async function ensureRoleConcepts(sql, env, role, fetchImpl = fetch) {
  const model = embeddingModel(env);
  const expectedCount = flattenRole(role).length;
  const rows = await sql`
    SELECT count(*)::int AS count
    FROM competency_concepts
    WHERE framework_version = ${FRAMEWORK_VERSION}
      AND role_id = ${role.roleId}
      AND embedding_model = ${model}
      AND embedding IS NOT NULL
  `;
  if (Number(rows[0]?.count || 0) === expectedCount) return;

  const concepts = flattenRole(role).map((item) => ({
    frameworkVersion: FRAMEWORK_VERSION,
    roleId: role.roleId,
    competencyId: item.competencyId,
    subCompetencyId: item.subCompetencyId,
    competencyName: item.competencyName,
    subCompetencyName: item.subCompetencyName,
    conceptText: item.definition,
    requiredLevel: item.requiredLevel,
  }));
  await upsertCompetencyConcepts(sql, env, concepts, fetchImpl);
}

async function semanticValidateBatch(sql, env, role, questions, fetchImpl = fetch) {
  await ensureRoleConcepts(sql, env, role, fetchImpl);
  const embeddings = await embedTexts(env, questions.map((question) => question.questionText), fetchImpl);
  const threshold = semanticThreshold(env);
  const model = embeddingModel(env);
  const output = [];

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const embedding = embeddings[index];
    const literal = vectorLiteral(embedding);
    const matches = await sql`
      SELECT competency_id, sub_competency_id, competency_name, sub_competency_name,
             1 - (embedding <=> ${literal}::vector) AS similarity
      FROM competency_concepts
      WHERE framework_version = ${FRAMEWORK_VERSION}
        AND role_id = ${role.roleId}
        AND embedding_model = ${model}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT 5
    `;
    const expectedIndex = matches.findIndex((match) => match.competency_id === question.competencyId && match.sub_competency_id === question.subCompetencyId);
    const expectedMatch = expectedIndex >= 0 ? matches[expectedIndex] : null;
    const expectedSimilarity = expectedMatch ? Number(expectedMatch.similarity) : null;
    const expectedRank = expectedIndex >= 0 ? expectedIndex + 1 : null;
    const passed = expectedRank === 1 && expectedSimilarity != null && expectedSimilarity >= threshold;
    output.push({
      passed,
      status: passed ? 'validated' : 'needs_review',
      reason: passed
        ? 'Expected sub-competency is the strongest semantic match and clears the threshold.'
        : 'Expected sub-competency is not the strongest semantic match or does not clear the threshold.',
      threshold,
      embeddingModel: model,
      questionEmbedding: embedding,
      expectedRank,
      expectedSimilarity,
      topMatch: matches[0] || null,
      matches,
    });
  }
  return output;
}

async function persistPendingQuestion(sql, question) {
  const optionsJson = JSON.stringify(question.options);
  const rows = await sql`
    INSERT INTO question_bank (
      question_id, competency_id, sub_competency_id, question_text, options_json,
      correct_option, explanation, difficulty, source_type, source_ref,
      validation_status, validation_reason, updated_at
    ) VALUES (
      ${question.questionId}, ${question.competencyId}, ${question.subCompetencyId}, ${question.questionText}, ${optionsJson}::jsonb,
      ${question.correctOption}, ${question.explanation}, ${question.difficulty}, 'ai', ${question.sourceRef},
      'needs_review', 'Semantic validation was unavailable during generation; structural validation passed.', now()
    )
    ON CONFLICT (question_id) DO UPDATE SET updated_at = now()
    RETURNING id
  `;
  return rows[0]?.id;
}

export async function createBaselineAssessment(sql, env, userId, profile = {}, fetchImpl = fetch) {
  const role = resolveRole(profile);
  const sourceRef = `assessment:${userId}:${role.roleId}:${Date.now()}:${randomHex(6)}`;
  const generated = await generateQuestions(env, role, fetchImpl);
  const questions = generated.map((question, index) => ({
    ...question,
    questionId: `${role.roleId}-${Date.now()}-${String(index + 1).padStart(2, '0')}-${randomHex(3)}`,
    sourceRef,
    sourceType: 'ai',
  }));

  let validations = null;
  let validationMode = 'semantic';
  try {
    validations = await semanticValidateBatch(sql, env, role, questions, fetchImpl);
  } catch (error) {
    console.error('Semantic validation unavailable; preserving structurally valid questions:', error);
    validationMode = 'structural-fallback';
  }

  const publicQuestions = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const validation = validations?.[index] || null;
    if (validation) await persistQuestionValidation(sql, question, validation);
    else await persistPendingQuestion(sql, question);
    publicQuestions.push({
      questionId: question.questionId,
      competencyId: question.competencyId,
      subCompetencyId: question.subCompetencyId,
      question: question.questionText,
      options: question.options,
      difficulty: question.difficulty,
      validation: validation ? {
        status: validation.status,
        similarity: validation.expectedSimilarity == null ? null : Number(validation.expectedSimilarity.toFixed(3)),
        expectedRank: validation.expectedRank,
      } : { status: 'needs_review', similarity: null, expectedRank: null },
    });
  }

  return {
    assessmentId: sourceRef,
    role: { id: role.roleId, name: role.roleName },
    questionCount: publicQuestions.length,
    validationMode,
    validatedCount: validations ? validations.filter((item) => item.passed).length : 0,
    questions: publicQuestions,
  };
}

function roleMaps(role) {
  const subMap = new Map();
  const competencyMap = new Map();
  for (const competency of role.competencies) {
    competencyMap.set(competency.competencyId, competency);
    for (const sub of competency.subCompetencies) subMap.set(sub.id, { ...sub, competencyId: competency.competencyId, competencyName: competency.name });
  }
  return { subMap, competencyMap };
}

function round(value) { return Math.round(Number(value) * 100) / 100; }

export function scoreAssessmentRows(rows, answers, role = FIELD_ENUMERATOR_ROLE) {
  const answerMap = new Map((Array.isArray(answers) ? answers : []).map((answer) => [String(answer.questionId || ''), String(answer.selectedOption || '').toUpperCase()]));
  const { subMap, competencyMap } = roleMaps(role);
  const subScores = new Map();
  const competencyScores = new Map();
  let totalCorrect = 0;

  for (const row of rows) {
    const selected = answerMap.get(String(row.question_id));
    const correct = selected === String(row.correct_option).toUpperCase();
    if (correct) totalCorrect += 1;
    const subKey = row.sub_competency_id;
    const currentSub = subScores.get(subKey) || { correct: 0, total: 0, competencyId: row.competency_id };
    currentSub.total += 1;
    if (correct) currentSub.correct += 1;
    subScores.set(subKey, currentSub);
  }

  const subCompetencies = [...subScores.entries()].map(([subId, value]) => {
    const meta = subMap.get(subId) || { name: subId };
    const scorePercentage = value.total ? (value.correct / value.total) * 100 : 0;
    const current = competencyScores.get(value.competencyId) || [];
    current.push(scorePercentage);
    competencyScores.set(value.competencyId, current);
    return {
      id: subId,
      name: meta.name,
      competencyId: value.competencyId,
      correct: value.correct,
      total: value.total,
      scorePercentage: round(scorePercentage),
    };
  });

  const competencies = [...competencyScores.entries()].map(([competencyId, scores]) => {
    const meta = competencyMap.get(competencyId) || { name: competencyId };
    return {
      id: competencyId,
      name: meta.name,
      requiredLevel: meta.requiredLevel || null,
      scorePercentage: round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    };
  }).sort((a, b) => a.scorePercentage - b.scorePercentage);

  return {
    totalQuestions: rows.length,
    correctAnswers: totalCorrect,
    overallScore: rows.length ? round((totalCorrect / rows.length) * 100) : 0,
    competencies,
    subCompetencies,
  };
}

function deterministicRecommendations(competencies) {
  const weakest = [...competencies].sort((a, b) => a.scorePercentage - b.scorePercentage).slice(0, 3);
  const weakIds = weakest.map((item) => item.id);
  const ranked = COURSE_CATALOG.map((course) => ({
    ...course,
    priority: course.competencyIds.filter((id) => weakIds.includes(id)).length,
  })).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return ranked.slice(0, 3).map(({ priority, ...course }) => course);
}

async function aiRecommendations(env, competencies, fetchImpl = fetch) {
  const fallback = deterministicRecommendations(competencies);
  if (!env.OPENROUTER_API_KEY || !competencies.length) return { courses: fallback, aiPersonalized: false };
  try {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['course_ids', 'reason'],
      properties: {
        course_ids: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', enum: COURSE_CATALOG.map((course) => course.id) } },
        reason: { type: 'string', minLength: 20, maxLength: 400 },
      },
    };
    const raw = await callOpenRouterJson(env, {
      schemaName: 'gyansetu_course_recommendations',
      schema,
      temperature: 0.1,
      system: 'You are a training recommender. Choose exactly three courses only from the supplied catalog. Prioritize the learner’s weakest competency scores. Do not invent courses.',
      user: JSON.stringify({ competency_scores: competencies, catalog: COURSE_CATALOG }),
    }, fetchImpl);
    const ids = [...new Set(Array.isArray(raw.course_ids) ? raw.course_ids : [])].slice(0, 3);
    const courses = ids.map((id) => COURSE_CATALOG.find((course) => course.id === id)).filter(Boolean);
    if (courses.length !== 3) return { courses: fallback, aiPersonalized: false };
    return { courses, aiPersonalized: true, reason: String(raw.reason || '') };
  } catch (error) {
    console.error('AI recommendations unavailable; using deterministic catalog ranking:', error);
    return { courses: fallback, aiPersonalized: false };
  }
}

export async function submitBaselineAssessment(sql, env, userId, body = {}, fetchImpl = fetch) {
  const assessmentId = String(body.assessmentId || '');
  const prefix = `assessment:${userId}:`;
  if (!assessmentId.startsWith(prefix)) throw new Error('Assessment does not belong to the current user.');
  const answers = Array.isArray(body.answers) ? body.answers : [];

  const rows = await sql`
    SELECT question_id, competency_id, sub_competency_id, correct_option, explanation
    FROM question_bank
    WHERE source_ref = ${assessmentId}
    ORDER BY id
  `;
  if (!rows.length) throw new Error('Assessment questions could not be found.');
  if (answers.length !== rows.length) throw new Error('Answer every question before submitting the assessment.');

  const role = FIELD_ENUMERATOR_ROLE;
  const score = scoreAssessmentRows(rows, answers, role);
  for (const competency of score.competencies) {
    await sql`
      INSERT INTO user_skills (user_id, skill_name, self_reported_level, source)
      VALUES (${userId}, ${competency.name}, ${round(competency.scorePercentage / 20)}, 'assessment')
      ON CONFLICT (user_id, skill_name, source)
      DO UPDATE SET self_reported_level = EXCLUDED.self_reported_level, created_at = now()
    `;
  }

  const recommendations = await aiRecommendations(env, score.competencies, fetchImpl);
  return { ...score, recommendations };
}

export async function getAssessmentState(sql, userId, profile = {}) {
  const role = resolveRole(profile);
  const rows = await sql`
    SELECT skill_name, self_reported_level, created_at
    FROM user_skills
    WHERE user_id = ${userId} AND source = 'assessment'
    ORDER BY created_at DESC, skill_name
  `;
  const competencyByName = new Map(role.competencies.map((item) => [item.name, item]));
  const competencies = rows.map((row) => ({
    id: competencyByName.get(row.skill_name)?.competencyId || row.skill_name.toLowerCase().replace(/\s+/g, '_'),
    name: row.skill_name,
    scorePercentage: round(Number(row.self_reported_level || 0) * 20),
    requiredLevel: competencyByName.get(row.skill_name)?.requiredLevel || null,
  }));
  const overallScore = competencies.length ? round(competencies.reduce((sum, item) => sum + item.scorePercentage, 0) / competencies.length) : null;
  return {
    completed: competencies.length > 0,
    overallScore,
    competencies,
    role: { id: role.roleId, name: role.roleName },
    questionCount: questionCountForRole(role),
    recommendations: deterministicRecommendations(competencies),
  };
}

export function publicRole(role = FIELD_ENUMERATOR_ROLE) {
  return {
    id: role.roleId,
    name: role.roleName,
    domain: role.domain,
    description: role.description,
    competencies: role.competencies.map((competency) => ({
      id: competency.competencyId,
      name: competency.name,
      description: competency.description,
      requiredLevel: competency.requiredLevel,
      subCompetencies: competency.subCompetencies.map((sub) => ({ id: sub.id, name: sub.name, definition: sub.definition, requiredLevel: sub.requiredLevel })),
    })),
  };
}
