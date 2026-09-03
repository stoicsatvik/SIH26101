import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssessmentPlan,
  calculateQuestionCount,
  scoreAssessment,
  validateGeneratedQuestions,
} from '../src/assessment-core.js';

const role = {
  role_id: 'data_analyst',
  role_name: 'Data Analyst',
  competencies: [
    {
      competency_id: 'statistics',
      name: 'Statistics',
      sub_competencies: [
        { sub_competency_id: 'probability', name: 'Probability', definition: 'Probability concepts', required_level: 2 },
        { sub_competency_id: 'statistical_inference', name: 'Statistical Inference', definition: 'Inference from sample data', required_level: 3 },
      ],
    },
    {
      competency_id: 'data_processing',
      name: 'Data Processing',
      sub_competencies: [
        { sub_competency_id: 'data_cleaning', name: 'Data Cleaning', definition: 'Clean data', required_level: 3 },
      ],
    },
  ],
};

test('question count is rounded up to the next multiple of ten', () => {
  assert.equal(calculateQuestionCount(1), 10);
  assert.equal(calculateQuestionCount(10), 10);
  assert.equal(calculateQuestionCount(17), 20);
  assert.equal(calculateQuestionCount(21), 30);
  assert.equal(calculateQuestionCount(0), 0);
});

test('assessment plan covers every sub-competency and totals correctly', () => {
  const plan = buildAssessmentPlan(role);
  assert.equal(plan.question_count, 10);
  assert.equal(plan.sub_competency_count, 3);
  assert.equal(plan.coverage.reduce((sum, item) => sum + item.question_count, 0), 10);
  assert.ok(plan.coverage.every((item) => item.question_count >= 1));
});

test('validator accepts framework-bound questions with exact coverage', () => {
  const plan = buildAssessmentPlan(role);
  const questions = [];
  let q = 1;
  for (const coverage of plan.coverage) {
    for (let i = 0; i < coverage.question_count; i += 1) {
      questions.push({
        question_id: `Q${String(q++).padStart(3, '0')}`,
        question: `What is the best valid choice for ${coverage.sub_competency_id} case ${i + 1}?`,
        options: ['Choice one', 'Choice two', 'Choice three', 'Choice four'],
        correct_answer: 'B',
        competency_id: coverage.competency_id,
        sub_competency_id: coverage.sub_competency_id,
        difficulty: 'medium',
        explanation: 'Choice two is correct for this test fixture.',
      });
    }
  }
  const result = validateGeneratedQuestions({ questions, role, plan });
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('validator rejects invented sub-competencies', () => {
  const plan = buildAssessmentPlan(role);
  const questions = Array.from({ length: plan.question_count }, (_, i) => ({
    question_id: `Q${i + 1}`,
    question: `Question number ${i + 1} has sufficient text?`,
    options: ['A1', 'B1', 'C1', 'D1'],
    correct_answer: 'A',
    competency_id: 'statistics',
    sub_competency_id: 'invented_skill',
    difficulty: 'easy',
    explanation: 'Fixture explanation',
  }));
  const result = validateGeneratedQuestions({ questions, role, plan });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('unknown sub_competency_id')));
});

test('scoring is deterministic and aggregates sub-competencies before competencies', () => {
  const questions = [
    { question_id: 'Q1', competency_id: 'statistics', sub_competency_id: 'probability', correct_answer: 'A' },
    { question_id: 'Q2', competency_id: 'statistics', sub_competency_id: 'probability', correct_answer: 'B' },
    { question_id: 'Q3', competency_id: 'statistics', sub_competency_id: 'statistical_inference', correct_answer: 'C' },
  ];
  const answers = [
    { question_id: 'Q1', selected_answer: 'A' },
    { question_id: 'Q2', selected_answer: 'D' },
    { question_id: 'Q3', selected_answer: 'C' },
  ];
  const result = scoreAssessment({ questions, answers });
  assert.equal(result.overall_score, (2 / 3) * 100);
  const probability = result.sub_competency_results.find((x) => x.sub_competency_id === 'probability');
  assert.equal(probability.score_percentage, 50);
  const statistics = result.competency_results.find((x) => x.competency_id === 'statistics');
  assert.equal(statistics.score_percentage, 75);
});
