import { neon } from '@neondatabase/serverless';
import { buildAssessmentPlan, scoreAssessment, validateGeneratedQuestions } from './assessment-core.js';
import { generateAssessmentQuestions } from './openrouter.js';
import {
  findRole,
  getFrameworkVersion,
  getRequiredLevels,
  listRoles,
  resolveRoleFromCandidates,
} from './competency-service.js';
import { buildGapAnalysis } from './gap-engine.js';

const MODEL_NAME = 'openrouter/free';
const VALID_ANSWERS = new Set(['A', 'B', 'C', 'D']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getSql(env) {
  if (!env.DATABASE_URL) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Database is not configured.');
  return neon(env.DATABASE_URL);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function numericId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'INVALID_ID', `${label} must be a positive integer.`);
  return id;
}

function publicQuestion(row) {
  return {
    question_id: row.question_id,
    question: row.question,
    options: row.options,
    difficulty: row.difficulty,
  };
}

function shuffled(items) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff;
    const j = Math.floor(random * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

async function resolveUserRole(sql, user, requestedRoleId) {
  if (requestedRoleId) {
    const role = findRole(requestedRoleId);
    if (!role) throw new ApiError(400, 'UNKNOWN_ROLE', `Unknown role_id: ${requestedRoleId}.`);
    return role;
  }

  const rows = await sql`
    SELECT target_role, designation, current_job_title
    FROM user_profiles
    WHERE user_id = ${user.id}
    LIMIT 1
  `;
  const profile = rows[0] || {};
  const role = resolveRoleFromCandidates([profile.target_role, profile.designation, profile.current_job_title]);
  if (!role) {
    throw new ApiError(
      409,
      'ROLE_NOT_RESOLVED',
      'The user profile does not map to a competency-framework role yet. Supply role_id for the prototype.',
      { available_roles: listRoles() },
    );
  }
  return role;
}

async function bankRowsForCoverage(sql, roleId, frameworkVersion, item, limit) {
  return sql`
    SELECT id, question, options, correct_answer, competency_id, sub_competency_id, difficulty, explanation
    FROM question_bank
    WHERE role_id = ${roleId}
      AND framework_version = ${frameworkVersion}
      AND competency_id = ${item.competency_id}
      AND sub_competency_id = ${item.sub_competency_id}
      AND validation_status = 'validated'
    ORDER BY times_used ASC, id ASC
    LIMIT ${limit}
  `;
}

async function insertGeneratedQuestions(sql, role, frameworkVersion, questions) {
  for (const question of questions) {
    await sql`
      INSERT INTO question_bank (
        role_id, framework_version, generator_question_id, question, options, correct_answer,
        competency_id, sub_competency_id, difficulty, explanation,
        source_type, model_provider, model_name, validation_status
      ) VALUES (
        ${role.role_id}, ${frameworkVersion}, ${question.question_id || null}, ${question.question},
        ${JSON.stringify(question.options)}::jsonb, ${question.correct_answer}, ${question.competency_id},
        ${question.sub_competency_id}, ${String(question.difficulty).toLowerCase()}, ${question.explanation},
        'framework_generated', 'openrouter', ${MODEL_NAME}, 'validated'
      )
      ON CONFLICT (role_id, framework_version, question) DO NOTHING
    `;
  }
}

async function ensureQuestionBankCoverage(sql, env, role, plan) {
  const frameworkVersion = getFrameworkVersion();
  let generatedCount = 0;

  for (let round = 0; round < 2; round += 1) {
    const shortages = [];
    for (const item of plan.coverage) {
      const rows = await bankRowsForCoverage(sql, role.role_id, frameworkVersion, item, item.question_count);
      const missing = item.question_count - rows.length;
      if (missing > 0) shortages.push({ ...item, question_count: missing });
    }

    if (shortages.length === 0) break;
    if (!env.OPENROUTER_API_KEY) {
      throw new ApiError(
        503,
        'OPENROUTER_NOT_CONFIGURED',
        'The question bank does not contain enough questions and OPENROUTER_API_KEY is not configured.',
      );
    }

    const generationPlan = {
      role_id: plan.role_id,
      role_name: plan.role_name,
      question_count: shortages.reduce((sum, item) => sum + item.question_count, 0),
      sub_competency_count: shortages.length,
      coverage: shortages,
    };

    const questions = await generateAssessmentQuestions({
      apiKey: env.OPENROUTER_API_KEY,
      role,
      plan: generationPlan,
      model: MODEL_NAME,
    });
    const validation = validateGeneratedQuestions({ questions, role, plan: generationPlan });
    if (!validation.valid) {
      if (round === 1) {
        throw new ApiError(502, 'AI_VALIDATION_FAILED', 'AI-generated questions failed validation.', {
          errors: validation.errors,
        });
      }
      continue;
    }

    await insertGeneratedQuestions(sql, role, frameworkVersion, questions);
    generatedCount += questions.length;
  }

  const selected = [];
  for (const item of plan.coverage) {
    const rows = await bankRowsForCoverage(sql, role.role_id, frameworkVersion, item, item.question_count);
    if (rows.length !== item.question_count) {
      throw new ApiError(
        502,
        'QUESTION_BANK_INCOMPLETE',
        `Question bank coverage is incomplete for ${item.sub_competency_id}.`,
      );
    }
    selected.push(...rows);
  }

  return { selected: shuffled(selected), generatedCount, frameworkVersion };
}

async function handleRoleList() {
  return json({ roles: listRoles(), framework_version: getFrameworkVersion() });
}

async function handleRoleGet(roleId) {
  const role = findRole(roleId);
  if (!role) return json({ error: 'Role not found.', code: 'UNKNOWN_ROLE' }, 404);
  return json({ role, framework_version: getFrameworkVersion() });
}

async function handleStartAssessment(request, env, user) {
  const body = await readJson(request);
  const sql = getSql(env);
  const role = await resolveUserRole(sql, user, body.role_id);
  const plan = buildAssessmentPlan(role);
  const bank = await ensureQuestionBankCoverage(sql, env, role, plan);

  const assessmentRows = await sql`
    INSERT INTO assessments (
      user_id, role_id, framework_version, assessment_type, status, total_questions,
      model_provider, model_name
    ) VALUES (
      ${user.id}, ${role.role_id}, ${bank.frameworkVersion}, ${body.assessment_type === 'reassessment' ? 'reassessment' : 'diagnostic'},
      'in_progress', ${plan.question_count}, 'openrouter', ${MODEL_NAME}
    )
    RETURNING id, role_id, framework_version, assessment_type, status, total_questions, started_at
  `;
  const assessment = assessmentRows[0];

  const stored = [];
  for (let index = 0; index < bank.selected.length; index += 1) {
    const bankQuestion = bank.selected[index];
    const questionId = `Q${String(index + 1).padStart(3, '0')}`;
    const rows = await sql`
      INSERT INTO assessment_questions (
        assessment_id, question_bank_id, question_id, question, options, correct_answer,
        competency_id, sub_competency_id, difficulty, explanation
      ) VALUES (
        ${assessment.id}, ${bankQuestion.id}, ${questionId}, ${bankQuestion.question},
        ${JSON.stringify(bankQuestion.options)}::jsonb, ${bankQuestion.correct_answer}, ${bankQuestion.competency_id},
        ${bankQuestion.sub_competency_id}, ${bankQuestion.difficulty}, ${bankQuestion.explanation}
      )
      RETURNING id, question_id, question, options, difficulty
    `;
    stored.push(rows[0]);
    await sql`UPDATE question_bank SET times_used = times_used + 1 WHERE id = ${bankQuestion.id}`;
  }

  return json(
    {
      assessment,
      generated_question_bank_items: bank.generatedCount,
      questions: stored.map(publicQuestion),
    },
    201,
  );
}

async function ownedAssessment(sql, assessmentId, userId) {
  const rows = await sql`
    SELECT id, user_id, role_id, framework_version, assessment_type, status, total_questions,
           overall_score, started_at, completed_at
    FROM assessments
    WHERE id = ${assessmentId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!rows[0]) throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  return rows[0];
}

async function handleGetAssessment(env, user, assessmentId) {
  const sql = getSql(env);
  const assessment = await ownedAssessment(sql, assessmentId, user.id);
  const questions = await sql`
    SELECT question_id, question, options, difficulty
    FROM assessment_questions
    WHERE assessment_id = ${assessmentId}
    ORDER BY id ASC
  `;
  return json({ assessment, questions: questions.map(publicQuestion) });
}

function normalizeSubmittedAnswers(answers) {
  if (!Array.isArray(answers)) throw new ApiError(400, 'INVALID_ANSWERS', 'answers must be an array.');
  const seen = new Set();
  return answers.map((answer) => {
    const questionId = String(answer?.question_id || '').trim();
    if (!questionId) throw new ApiError(400, 'INVALID_ANSWERS', 'Every answer needs question_id.');
    if (seen.has(questionId)) throw new ApiError(400, 'DUPLICATE_ANSWER', `Duplicate answer for ${questionId}.`);
    seen.add(questionId);
    const selected = answer?.selected_answer == null ? null : String(answer.selected_answer).trim().toUpperCase();
    if (selected !== null && !VALID_ANSWERS.has(selected)) {
      throw new ApiError(400, 'INVALID_ANSWER_OPTION', `Invalid answer for ${questionId}.`);
    }
    return { question_id: questionId, selected_answer: selected };
  });
}

async function handleSubmitAssessment(request, env, user, assessmentId) {
  const body = await readJson(request);
  const submitted = normalizeSubmittedAnswers(body.answers);
  const sql = getSql(env);
  const assessment = await ownedAssessment(sql, assessmentId, user.id);
  if (assessment.status === 'completed') {
    throw new ApiError(409, 'ASSESSMENT_ALREADY_COMPLETED', 'This assessment has already been submitted.');
  }

  const questionRows = await sql`
    SELECT id, question_id, correct_answer, competency_id, sub_competency_id
    FROM assessment_questions
    WHERE assessment_id = ${assessmentId}
    ORDER BY id ASC
  `;
  if (questionRows.length !== Number(assessment.total_questions)) {
    throw new ApiError(500, 'ASSESSMENT_CORRUPT', 'Stored assessment question count does not match assessment metadata.');
  }

  const validQuestionIds = new Set(questionRows.map((row) => row.question_id));
  for (const answer of submitted) {
    if (!validQuestionIds.has(answer.question_id)) {
      throw new ApiError(400, 'UNKNOWN_QUESTION', `Question ${answer.question_id} does not belong to this assessment.`);
    }
  }

  const scoring = scoreAssessment({ questions: questionRows, answers: submitted });
  const role = findRole(assessment.role_id);
  if (!role) throw new ApiError(500, 'ROLE_MISSING', 'Assessment role no longer exists in the competency framework.');
  const required = getRequiredLevels(role);
  const gapAnalysis = buildGapAnalysis({
    subCompetencyResults: scoring.sub_competency_results,
    requiredLevels: required.subCompetencyLevels,
  });

  const submittedMap = new Map(submitted.map((answer) => [answer.question_id, answer.selected_answer]));
  await sql`DELETE FROM user_answers WHERE assessment_id = ${assessmentId}`;
  for (const question of questionRows) {
    const selected = submittedMap.has(question.question_id) ? submittedMap.get(question.question_id) : null;
    const isCorrect = selected === null ? null : selected === question.correct_answer;
    await sql`
      INSERT INTO user_answers (assessment_id, question_id, selected_answer, is_correct)
      VALUES (${assessmentId}, ${question.id}, ${selected}, ${isCorrect})
    `;
  }

  await sql`DELETE FROM sub_competency_results WHERE assessment_id = ${assessmentId}`;
  for (const result of scoring.sub_competency_results) {
    const requiredLevel = required.subCompetencyLevels.get(result.sub_competency_id) || 1;
    await sql`
      INSERT INTO sub_competency_results (
        assessment_id, competency_id, sub_competency_id, required_level,
        questions_attempted, correct_answers, total_questions, score_percentage
      ) VALUES (
        ${assessmentId}, ${result.competency_id}, ${result.sub_competency_id}, ${requiredLevel},
        ${result.questions_attempted}, ${result.correct_answers}, ${result.total_questions}, ${result.score_percentage}
      )
    `;

    await sql`
      INSERT INTO user_sub_competency_profiles (
        user_id, role_id, competency_id, sub_competency_id, required_level,
        latest_score, current_level, gap_status, evidence_assessment_id, updated_at
      ) VALUES (
        ${user.id}, ${assessment.role_id}, ${result.competency_id}, ${result.sub_competency_id}, ${requiredLevel},
        ${result.score_percentage}, NULL, 'mapping_required', ${assessmentId}, now()
      )
      ON CONFLICT (user_id, role_id, sub_competency_id) DO UPDATE SET
        competency_id = EXCLUDED.competency_id,
        required_level = EXCLUDED.required_level,
        latest_score = EXCLUDED.latest_score,
        current_level = NULL,
        gap_status = 'mapping_required',
        evidence_assessment_id = EXCLUDED.evidence_assessment_id,
        updated_at = now()
    `;
  }

  await sql`DELETE FROM competency_results WHERE assessment_id = ${assessmentId}`;
  for (const result of scoring.competency_results) {
    const requiredLevel = required.competencyLevels.get(result.competency_id) || 1;
    await sql`
      INSERT INTO competency_results (
        assessment_id, competency_id, required_level, current_score, current_level, gap_status
      ) VALUES (
        ${assessmentId}, ${result.competency_id}, ${requiredLevel}, ${result.score_percentage}, NULL, 'mapping_required'
      )
    `;

    await sql`
      INSERT INTO user_competency_profiles (
        user_id, role_id, competency_id, required_level, latest_score,
        current_level, gap_status, evidence_assessment_id, updated_at
      ) VALUES (
        ${user.id}, ${assessment.role_id}, ${result.competency_id}, ${requiredLevel}, ${result.score_percentage},
        NULL, 'mapping_required', ${assessmentId}, now()
      )
      ON CONFLICT (user_id, role_id, competency_id) DO UPDATE SET
        required_level = EXCLUDED.required_level,
        latest_score = EXCLUDED.latest_score,
        current_level = NULL,
        gap_status = 'mapping_required',
        evidence_assessment_id = EXCLUDED.evidence_assessment_id,
        updated_at = now()
    `;
  }

  await sql`
    UPDATE assessments
    SET status = 'completed', overall_score = ${scoring.overall_score}, completed_at = now()
    WHERE id = ${assessmentId}
  `;

  return json({
    assessment_id: assessmentId,
    overall_score: scoring.overall_score,
    total_questions: scoring.total_questions,
    total_correct: scoring.total_correct,
    sub_competency_results: scoring.sub_competency_results,
    competency_results: scoring.competency_results,
    gap_analysis: gapAnalysis,
    gap_mapping_status: 'mapping_required',
    note: 'Percentage-to-proficiency mapping is not finalized, so no artificial gap/met decision is being made yet.',
  });
}

async function handleResults(env, user, assessmentId) {
  const sql = getSql(env);
  const assessment = await ownedAssessment(sql, assessmentId, user.id);
  if (assessment.status !== 'completed') {
    throw new ApiError(409, 'ASSESSMENT_NOT_COMPLETED', 'Assessment results are not available until submission.');
  }
  const [subCompetencies, competencies] = await Promise.all([
    sql`SELECT * FROM sub_competency_results WHERE assessment_id = ${assessmentId} ORDER BY competency_id, sub_competency_id`,
    sql`SELECT * FROM competency_results WHERE assessment_id = ${assessmentId} ORDER BY competency_id`,
  ]);
  return json({ assessment, sub_competency_results: subCompetencies, competency_results: competencies });
}

async function handleCompetencyProfile(env, user) {
  const sql = getSql(env);
  const [subCompetencies, competencies] = await Promise.all([
    sql`
      SELECT role_id, competency_id, sub_competency_id, required_level, latest_score,
             current_level, gap_status, evidence_assessment_id, updated_at
      FROM user_sub_competency_profiles
      WHERE user_id = ${user.id}
      ORDER BY role_id, competency_id, sub_competency_id
    `,
    sql`
      SELECT role_id, competency_id, required_level, latest_score,
             current_level, gap_status, evidence_assessment_id, updated_at
      FROM user_competency_profiles
      WHERE user_id = ${user.id}
      ORDER BY role_id, competency_id
    `,
  ]);
  return json({ competencies, sub_competencies: subCompetencies, mapping_status: 'mapping_required' });
}

export function isAssessmentApiPath(pathname) {
  return pathname === '/api/competency/roles' ||
    pathname.startsWith('/api/competency/roles/') ||
    pathname === '/api/assessments/start' ||
    /^\/api\/assessments\/\d+(?:\/submit|\/results)?$/.test(pathname) ||
    pathname === '/api/users/me/competency-profile';
}

export async function handleAssessmentApi(request, env, user) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && url.pathname === '/api/competency/roles') return handleRoleList();
    if (request.method === 'GET' && url.pathname.startsWith('/api/competency/roles/')) {
      return handleRoleGet(decodeURIComponent(url.pathname.slice('/api/competency/roles/'.length)));
    }
    if (request.method === 'POST' && url.pathname === '/api/assessments/start') {
      return handleStartAssessment(request, env, user);
    }
    if (request.method === 'GET' && url.pathname === '/api/users/me/competency-profile') {
      return handleCompetencyProfile(env, user);
    }

    const match = url.pathname.match(/^\/api\/assessments\/(\d+)(?:\/(submit|results))?$/);
    if (match) {
      const assessmentId = numericId(match[1], 'assessment_id');
      if (request.method === 'GET' && !match[2]) return handleGetAssessment(env, user, assessmentId);
      if (request.method === 'POST' && match[2] === 'submit') {
        return handleSubmitAssessment(request, env, user, assessmentId);
      }
      if (request.method === 'GET' && match[2] === 'results') return handleResults(env, user, assessmentId);
    }

    return json({ error: 'Assessment API route not found.', code: 'ROUTE_NOT_FOUND' }, 404);
  } catch (error) {
    console.error('Assessment API failed:', error);
    if (error instanceof ApiError) {
      return json({ error: error.message, code: error.code, details: error.details }, error.status);
    }
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist')) {
      return json({
        error: 'Assessment database schema is not initialized. Apply migrations/002_assessment_schema.sql.',
        code: 'ASSESSMENT_SCHEMA_MISSING',
      }, 503);
    }
    return json({ error: 'Assessment backend error.', code: 'ASSESSMENT_BACKEND_ERROR' }, 500);
  }
}
