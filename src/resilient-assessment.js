import {
  COURSE_CATALOG,
  FIELD_ENUMERATOR_ROLE,
  createBaselineAssessment,
  resolveRole,
  scoreAssessmentRows,
} from './assessment-engine.js';

const START_TIMEOUT_MS = 12000;

const CURATED_FIELD_ENUMERATOR_QUESTIONS = [
  {
    competencyId: 'survey_operations',
    subCompetencyId: 'sampling_basics',
    questionText: 'You arrive at an assigned household and nobody is available. What is the most appropriate action for a field enumerator?',
    options: [
      'Replace it with a nearby household that is easier to contact',
      'Follow the prescribed revisit or non-response procedure for the assigned sample unit',
      'Ask a neighbour to answer on behalf of the household',
      'Mark the household as completed so the sample size stays unchanged',
    ],
    correctOption: 'B',
    explanation: 'Assigned sample units must not be substituted without authorization; approved revisit and non-response procedures preserve sample integrity.',
    difficulty: 'developing',
  },
  {
    competencyId: 'survey_operations',
    subCompetencyId: 'questionnaire_administration',
    questionText: 'A respondent asks you to rephrase a survey question because it sounds unclear. What should you do first?',
    options: [
      'Change the question freely so it sounds more natural',
      'Use the approved clarification or interviewer instruction while preserving the intended wording',
      'Skip the question and continue to the next section',
      'Suggest the answer that seems most likely',
    ],
    correctOption: 'B',
    explanation: 'Standardized administration reduces interviewer bias, so clarifications should follow approved instructions rather than improvised wording.',
    difficulty: 'developing',
  },
  {
    competencyId: 'survey_operations',
    subCompetencyId: 'field_protocols',
    questionText: 'During a field visit, a situation occurs that is not covered by the normal visit procedure. What is the best response?',
    options: [
      'Invent a new rule and continue',
      'Ignore the issue and submit the form anyway',
      'Document the situation and follow the escalation or supervisor procedure',
      'Ask another respondent what should be done',
    ],
    correctOption: 'C',
    explanation: 'Unexpected field situations should be documented and escalated through approved channels instead of being handled through improvised rules.',
    difficulty: 'developing',
  },
  {
    competencyId: 'data_quality',
    subCompetencyId: 'validation_consistency',
    questionText: 'A completed form shows an age of 8 years but also records the respondent as having 15 years of work experience. What should you do?',
    options: [
      'Accept both values because every response must be recorded exactly as entered',
      'Delete the work-experience answer without checking',
      'Flag the inconsistency and verify the relevant responses according to survey procedure',
      'Change the age to a value that makes the answers consistent',
    ],
    correctOption: 'C',
    explanation: 'Logical inconsistencies should be verified using approved validation procedures rather than silently changing or deleting responses.',
    difficulty: 'proficient',
  },
  {
    competencyId: 'data_quality',
    subCompetencyId: 'nonresponse_error_handling',
    questionText: 'A respondent refuses to answer one sensitive question. Which action best protects data quality?',
    options: [
      'Guess a plausible answer based on earlier responses',
      'Record the refusal or missing-response code according to the questionnaire instructions',
      'Leave the field blank without any indication',
      'Ask a family member to provide the answer secretly',
    ],
    correctOption: 'B',
    explanation: 'Refusals and missing responses should be recorded using approved codes; inventing data creates measurement error and violates procedure.',
    difficulty: 'developing',
  },
  {
    competencyId: 'statistical_fundamentals',
    subCompetencyId: 'descriptive_statistics',
    questionText: 'Five households report monthly incomes of 10, 12, 12, 14, and 52 thousand rupees. Which measure is least affected by the unusually high value?',
    options: ['Mean', 'Median', 'Range', 'Sum'],
    correctOption: 'B',
    explanation: 'The median depends on the middle ordered value and is less affected by an extreme observation than the mean, range, or sum.',
    difficulty: 'basic',
  },
  {
    competencyId: 'statistical_fundamentals',
    subCompetencyId: 'tables_charts_interpretation',
    questionText: 'A bar chart shows District A at 60% and District B at 45% for a survey indicator. Which conclusion is directly supported?',
    options: [
      'District A is 15 percentage points higher than District B',
      'District A has exactly 15 more respondents than District B',
      'District A has a population 15% larger than District B',
      'The survey must have sampled more households in District A',
    ],
    correctOption: 'A',
    explanation: 'The chart supports a difference of 15 percentage points; it does not by itself establish respondent counts, population size, or sample size.',
    difficulty: 'developing',
  },
  {
    competencyId: 'digital_data_collection',
    subCompetencyId: 'digital_survey_tools',
    questionText: 'A mobile survey form displays a validation warning after you enter a response. What should you normally do?',
    options: [
      'Disable the validation rule permanently',
      'Check the response and follow the form guidance before proceeding',
      'Enter a random value until the warning disappears',
      'Close the app and mark the interview complete',
    ],
    correctOption: 'B',
    explanation: 'Validation prompts are designed to catch possible entry errors and should be reviewed according to the data-collection workflow.',
    difficulty: 'developing',
  },
  {
    competencyId: 'digital_data_collection',
    subCompetencyId: 'data_confidentiality',
    questionText: 'Which practice best protects respondent confidentiality on a field data-collection device?',
    options: [
      'Share the login with teammates so everyone can work faster',
      'Store screenshots of completed forms in a personal messaging app',
      'Keep credentials private and use only approved storage and synchronization methods',
      'Copy respondent data to a personal spreadsheet as a backup',
    ],
    correctOption: 'C',
    explanation: 'Credentials and respondent data should remain within approved systems and access controls to reduce unauthorized disclosure risk.',
    difficulty: 'developing',
  },
  {
    competencyId: 'digital_data_collection',
    subCompetencyId: 'reporting_documentation',
    questionText: 'You encounter repeated synchronization failures during fieldwork. What information is most useful to record for your supervisor?',
    options: [
      'Only that the app was annoying to use',
      'The affected cases, time, error details, actions already tried, and current status',
      'Nothing, because technical problems are not part of field reporting',
      'Only the respondent names so the issue can be remembered later',
    ],
    correctOption: 'B',
    explanation: 'Clear operational documentation should capture the affected work, error context, troubleshooting already attempted, and unresolved status.',
    difficulty: 'developing',
  },
];

function randomHex(bytes = 6) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Assessment generation exceeded ${Math.round(ms / 1000)} seconds.`)), ms);
  });
}

async function createCuratedFallback(sql, userId, profile = {}) {
  const role = resolveRole(profile);
  const sourceRef = `assessment:${userId}:${role.roleId}:${Date.now()}:fallback-${randomHex(3)}`;
  const publicQuestions = [];

  for (let index = 0; index < CURATED_FIELD_ENUMERATOR_QUESTIONS.length; index += 1) {
    const question = CURATED_FIELD_ENUMERATOR_QUESTIONS[index];
    const questionId = `${role.roleId}-fallback-${Date.now()}-${String(index + 1).padStart(2, '0')}-${randomHex(2)}`;
    const optionsJson = JSON.stringify(question.options);
    await sql`
      INSERT INTO question_bank (
        question_id, competency_id, sub_competency_id, question_text, options_json,
        correct_option, explanation, difficulty, source_type, source_ref,
        validation_status, validation_reason, updated_at
      ) VALUES (
        ${questionId}, ${question.competencyId}, ${question.subCompetencyId}, ${question.questionText}, ${optionsJson}::jsonb,
        ${question.correctOption}, ${question.explanation}, ${question.difficulty}, 'manual', ${sourceRef},
        'needs_review', 'Curated fallback question used because live AI generation or semantic validation exceeded the demo timeout.', now()
      )
    `;
    publicQuestions.push({
      questionId,
      competencyId: question.competencyId,
      subCompetencyId: question.subCompetencyId,
      question: question.questionText,
      options: question.options,
      difficulty: question.difficulty,
      validation: { status: 'needs_review', similarity: null, expectedRank: null },
    });
  }

  return {
    assessmentId: sourceRef,
    role: { id: role.roleId, name: role.roleName },
    questionCount: publicQuestions.length,
    generationMode: 'curated-fallback',
    validationMode: 'structural-fallback',
    validatedCount: 0,
    questions: publicQuestions,
  };
}

export async function createBaselineAssessmentResilient(sql, env, userId, profile = {}) {
  try {
    const result = await Promise.race([
      createBaselineAssessment(sql, env, userId, profile),
      timeoutAfter(START_TIMEOUT_MS),
    ]);
    return { generationMode: 'openrouter', ...result };
  } catch (error) {
    console.error('Live assessment generation failed or timed out; using curated fallback:', error);
    return createCuratedFallback(sql, userId, profile);
  }
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
    reason: 'Courses are ranked deterministically from your lowest competency scores so results appear immediately and remain reproducible.',
  };
}

export async function submitBaselineAssessmentFast(sql, userId, body = {}) {
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

  const score = scoreAssessmentRows(rows, answers, FIELD_ENUMERATOR_ROLE);
  for (const competency of score.competencies) {
    const storedLevel = Math.round((Number(competency.scorePercentage) / 20) * 100) / 100;
    await sql`
      INSERT INTO user_skills (user_id, skill_name, self_reported_level, source)
      VALUES (${userId}, ${competency.name}, ${storedLevel}, 'assessment')
      ON CONFLICT (user_id, skill_name, source)
      DO UPDATE SET self_reported_level = EXCLUDED.self_reported_level, created_at = now()
    `;
  }

  return { ...score, recommendations: deterministicRecommendations(score.competencies) };
}

export { CURATED_FIELD_ENUMERATOR_QUESTIONS, START_TIMEOUT_MS };
