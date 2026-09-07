import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_ENUMERATOR_ROLE,
  questionCountForRole,
  scoreAssessmentRows,
  validateGeneratedQuestions,
} from '../src/assessment-engine.js';
import {
  CURATED_FIELD_ENUMERATOR_QUESTIONS,
  START_TIMEOUT_MS,
} from '../src/resilient-assessment.js';

test('field enumerator role produces a 10-question assessment', () => {
  assert.equal(questionCountForRole(FIELD_ENUMERATOR_ROLE), 10);
  const subCompetencies = FIELD_ENUMERATOR_ROLE.competencies.flatMap((item) => item.subCompetencies);
  assert.equal(subCompetencies.length, 10);
});

test('generated questions must cover every field-enumerator sub-competency exactly once', () => {
  const questions = FIELD_ENUMERATOR_ROLE.competencies.flatMap((competency) =>
    competency.subCompetencies.map((sub, index) => ({
      competency_id: competency.competencyId,
      sub_competency_id: sub.id,
      question: `A field investigator encounters a realistic situation involving ${sub.name}. Which response best follows the expected procedure number ${index + 1}?`,
      options: ['Follow the approved procedure', 'Invent a replacement value', 'Skip documentation entirely', 'Share respondent data publicly'],
      correct_option: 'A',
      explanation: 'The approved procedure preserves consistency, data quality, and accountable field practice.',
      difficulty: 'developing',
    })),
  );

  const validated = validateGeneratedQuestions({ questions });
  assert.equal(validated.length, 10);
  assert.equal(new Set(validated.map((item) => item.subCompetencyId)).size, 10);
});

test('generated questions reject invented competency mappings', () => {
  const questions = FIELD_ENUMERATOR_ROLE.competencies.flatMap((competency) =>
    competency.subCompetencies.map((sub) => ({
      competency_id: competency.competencyId,
      sub_competency_id: sub.id,
      question: `Which response best demonstrates the expected ${sub.name} practice during official survey fieldwork?`,
      options: ['Approved procedure', 'Guessing data', 'Ignoring the form', 'Sharing confidential data'],
      correct_option: 'A',
      explanation: 'Approved procedures protect data quality and consistent field operations.',
      difficulty: 'developing',
    })),
  );
  questions[0].sub_competency_id = 'invented_skill';
  assert.throws(() => validateGeneratedQuestions({ questions }), /unknown competency mapping/);
});

test('assessment scoring is deterministic and grouped by competency', () => {
  const rows = [
    { question_id: 'q1', competency_id: 'survey_operations', sub_competency_id: 'sampling_basics', correct_option: 'A' },
    { question_id: 'q2', competency_id: 'survey_operations', sub_competency_id: 'questionnaire_administration', correct_option: 'B' },
    { question_id: 'q3', competency_id: 'data_quality', sub_competency_id: 'validation_consistency', correct_option: 'C' },
    { question_id: 'q4', competency_id: 'data_quality', sub_competency_id: 'nonresponse_error_handling', correct_option: 'D' },
  ];
  const answers = [
    { questionId: 'q1', selectedOption: 'A' },
    { questionId: 'q2', selectedOption: 'C' },
    { questionId: 'q3', selectedOption: 'C' },
    { questionId: 'q4', selectedOption: 'D' },
  ];

  const result = scoreAssessmentRows(rows, answers);
  assert.equal(result.correctAnswers, 3);
  assert.equal(result.overallScore, 75);
  const survey = result.competencies.find((item) => item.id === 'survey_operations');
  const quality = result.competencies.find((item) => item.id === 'data_quality');
  assert.equal(survey.scorePercentage, 50);
  assert.equal(quality.scorePercentage, 100);
});

test('curated fallback covers every field-enumerator sub-competency exactly once', () => {
  assert.equal(CURATED_FIELD_ENUMERATOR_QUESTIONS.length, 10);
  assert.equal(START_TIMEOUT_MS, 12000);
  const expected = new Set(
    FIELD_ENUMERATOR_ROLE.competencies.flatMap((competency) =>
      competency.subCompetencies.map((sub) => `${competency.competencyId}/${sub.id}`),
    ),
  );
  const actual = new Set(CURATED_FIELD_ENUMERATOR_QUESTIONS.map((question) => `${question.competencyId}/${question.subCompetencyId}`));
  assert.deepEqual(actual, expected);
  for (const question of CURATED_FIELD_ENUMERATOR_QUESTIONS) {
    assert.equal(question.options.length, 4);
    assert.match(question.correctOption, /^[A-D]$/);
    assert.ok(question.questionText.length >= 20);
  }
});
