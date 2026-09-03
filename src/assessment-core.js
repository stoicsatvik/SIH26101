const VALID_ANSWERS = new Set(['A', 'B', 'C', 'D']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export function calculateQuestionCount(subCompetencyCount) {
  if (!Number.isInteger(subCompetencyCount) || subCompetencyCount < 0) {
    throw new TypeError('subCompetencyCount must be a non-negative integer.');
  }
  if (subCompetencyCount === 0) return 0;
  return Math.ceil(subCompetencyCount / 10) * 10;
}

function assertRole(role) {
  if (!role || typeof role !== 'object') throw new TypeError('role is required.');
  if (!role.role_id || !Array.isArray(role.competencies)) {
    throw new TypeError('role must contain role_id and competencies.');
  }
}

export function getRoleIndex(role) {
  assertRole(role);

  const competencies = new Map();
  const subCompetencies = new Map();

  for (const competency of role.competencies) {
    if (!competency?.competency_id) {
      throw new Error('Every competency must have competency_id.');
    }
    if (competencies.has(competency.competency_id)) {
      throw new Error(`Duplicate competency_id: ${competency.competency_id}`);
    }
    competencies.set(competency.competency_id, competency);

    const subs = Array.isArray(competency.sub_competencies) ? competency.sub_competencies : [];
    for (const sub of subs) {
      if (!sub?.sub_competency_id) {
        throw new Error(`Sub-competency under ${competency.competency_id} is missing sub_competency_id.`);
      }
      if (subCompetencies.has(sub.sub_competency_id)) {
        throw new Error(`Duplicate sub_competency_id: ${sub.sub_competency_id}`);
      }
      subCompetencies.set(sub.sub_competency_id, {
        competency_id: competency.competency_id,
        competency,
        sub_competency: sub,
      });
    }
  }

  return { competencies, subCompetencies };
}

export function buildAssessmentPlan(role) {
  assertRole(role);
  const { subCompetencies } = getRoleIndex(role);
  const entries = [...subCompetencies.values()];

  if (entries.length === 0) {
    throw new Error(`Role ${role.role_id} has no sub-competencies to assess.`);
  }

  const questionCount = calculateQuestionCount(entries.length);
  const counts = new Map(entries.map(({ sub_competency }) => [sub_competency.sub_competency_id, 1]));

  const priority = [...entries].sort((a, b) => {
    const levelDiff = Number(b.sub_competency.required_level || 0) - Number(a.sub_competency.required_level || 0);
    if (levelDiff !== 0) return levelDiff;
    const competencyDiff = a.competency_id.localeCompare(b.competency_id);
    if (competencyDiff !== 0) return competencyDiff;
    return a.sub_competency.sub_competency_id.localeCompare(b.sub_competency.sub_competency_id);
  });

  let extras = questionCount - entries.length;
  let cursor = 0;
  while (extras > 0) {
    const target = priority[cursor % priority.length].sub_competency.sub_competency_id;
    counts.set(target, counts.get(target) + 1);
    cursor += 1;
    extras -= 1;
  }

  return {
    role_id: role.role_id,
    role_name: role.role_name || role.role_id,
    question_count: questionCount,
    sub_competency_count: entries.length,
    coverage: entries.map(({ competency_id, sub_competency }) => ({
      competency_id,
      sub_competency_id: sub_competency.sub_competency_id,
      required_level: Number(sub_competency.required_level),
      question_count: counts.get(sub_competency.sub_competency_id),
    })),
  };
}

function normalizedQuestionText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateGeneratedQuestions({ questions, role, plan }) {
  const errors = [];
  let index;

  try {
    index = getRoleIndex(role);
  } catch (error) {
    return { valid: false, errors: [String(error.message || error)] };
  }

  if (!Array.isArray(questions)) {
    return { valid: false, errors: ['questions must be an array.'] };
  }

  if (!plan || !Number.isInteger(plan.question_count)) {
    return { valid: false, errors: ['A valid assessment plan is required.'] };
  }

  if (questions.length !== plan.question_count) {
    errors.push(`Expected ${plan.question_count} questions but received ${questions.length}.`);
  }

  const ids = new Set();
  const texts = new Set();
  const actualCoverage = new Map();

  questions.forEach((question, questionIndex) => {
    const label = `Question ${questionIndex + 1}`;
    if (!question || typeof question !== 'object') {
      errors.push(`${label} must be an object.`);
      return;
    }

    const questionId = String(question.question_id || '').trim();
    if (!questionId) errors.push(`${label} is missing question_id.`);
    else if (ids.has(questionId)) errors.push(`${label} duplicates question_id ${questionId}.`);
    else ids.add(questionId);

    const text = normalizedQuestionText(question.question);
    if (text.length < 8) errors.push(`${label} has an empty or too-short question.`);
    else if (texts.has(text)) errors.push(`${label} duplicates another question.`);
    else texts.add(text);

    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`${label} must contain exactly four options.`);
    } else {
      const normalizedOptions = question.options.map((option) => String(option || '').trim());
      if (normalizedOptions.some((option) => !option)) errors.push(`${label} contains an empty option.`);
      if (new Set(normalizedOptions).size !== 4) errors.push(`${label} contains duplicate options.`);
    }

    const answer = String(question.correct_answer || '').trim().toUpperCase();
    if (!VALID_ANSWERS.has(answer)) errors.push(`${label} has invalid correct_answer.`);

    const competencyId = String(question.competency_id || '').trim();
    const subCompetencyId = String(question.sub_competency_id || '').trim();
    const subInfo = index.subCompetencies.get(subCompetencyId);

    if (!index.competencies.has(competencyId)) {
      errors.push(`${label} references unknown competency_id ${competencyId || '(empty)'}.`);
    }
    if (!subInfo) {
      errors.push(`${label} references unknown sub_competency_id ${subCompetencyId || '(empty)'}.`);
    } else if (subInfo.competency_id !== competencyId) {
      errors.push(`${label} maps ${subCompetencyId} to the wrong competency ${competencyId}.`);
    }

    if (subInfo) {
      actualCoverage.set(subCompetencyId, (actualCoverage.get(subCompetencyId) || 0) + 1);
    }

    const difficulty = String(question.difficulty || '').trim().toLowerCase();
    if (!VALID_DIFFICULTIES.has(difficulty)) errors.push(`${label} has invalid difficulty.`);

    if (!String(question.explanation || '').trim()) {
      errors.push(`${label} is missing explanation.`);
    }
  });

  for (const expected of plan.coverage || []) {
    const actual = actualCoverage.get(expected.sub_competency_id) || 0;
    if (actual !== expected.question_count) {
      errors.push(
        `Coverage mismatch for ${expected.sub_competency_id}: expected ${expected.question_count}, received ${actual}.`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export function scoreAssessment({ questions, answers }) {
  if (!Array.isArray(questions) || !Array.isArray(answers)) {
    throw new TypeError('questions and answers must be arrays.');
  }

  const answerMap = new Map(
    answers.map((answer) => [String(answer.question_id || ''), String(answer.selected_answer || '').toUpperCase()]),
  );

  const subStats = new Map();
  let totalCorrect = 0;

  for (const question of questions) {
    const competencyId = String(question.competency_id);
    const subCompetencyId = String(question.sub_competency_id);
    const key = `${competencyId}::${subCompetencyId}`;
    const selected = answerMap.get(String(question.question_id)) || null;
    const correctAnswer = String(question.correct_answer || '').toUpperCase();
    const isCorrect = selected !== null && selected === correctAnswer;

    if (isCorrect) totalCorrect += 1;

    if (!subStats.has(key)) {
      subStats.set(key, {
        competency_id: competencyId,
        sub_competency_id: subCompetencyId,
        questions_attempted: 0,
        correct_answers: 0,
        total_questions: 0,
      });
    }

    const stat = subStats.get(key);
    stat.total_questions += 1;
    if (selected !== null) stat.questions_attempted += 1;
    if (isCorrect) stat.correct_answers += 1;
  }

  const subCompetencyResults = [...subStats.values()].map((stat) => ({
    ...stat,
    score_percentage: stat.total_questions === 0 ? 0 : (stat.correct_answers / stat.total_questions) * 100,
  }));

  const competencyBuckets = new Map();
  for (const result of subCompetencyResults) {
    if (!competencyBuckets.has(result.competency_id)) competencyBuckets.set(result.competency_id, []);
    competencyBuckets.get(result.competency_id).push(result.score_percentage);
  }

  const competencyResults = [...competencyBuckets.entries()].map(([competencyId, scores]) => ({
    competency_id: competencyId,
    score_percentage: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    sub_competency_count: scores.length,
  }));

  return {
    overall_score: questions.length === 0 ? 0 : (totalCorrect / questions.length) * 100,
    total_questions: questions.length,
    total_correct: totalCorrect,
    sub_competency_results: subCompetencyResults,
    competency_results: competencyResults,
  };
}
