import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_ENUMERATOR_ROLE } from '../src/assessment-engine.js';
import {
  createInstantCuratedAssessment,
  dailyLiveAssessmentLimit,
  expectedCoverageKeys,
  hasCompleteRoleCoverage,
  submitInstantCuratedAssessment,
} from '../src/fast-assessment.js';

test('fast assessment expects all ten Field Enumerator mappings', () => {
  const keys = expectedCoverageKeys(FIELD_ENUMERATOR_ROLE);
  assert.equal(keys.length, 10);
  assert.equal(new Set(keys).size, 10);
});

test('cached question bank is used only with complete role coverage', () => {
  const rows = FIELD_ENUMERATOR_ROLE.competencies.flatMap((competency) =>
    competency.subCompetencies.map((sub) => ({
      competency_id: competency.competencyId,
      sub_competency_id: sub.id,
    })),
  );
  assert.equal(hasCompleteRoleCoverage(rows), true);
  assert.equal(hasCompleteRoleCoverage(rows.slice(0, 9)), false);
});

test('live OpenRouter assessment daily guard defaults to fifteen', () => {
  assert.equal(dailyLiveAssessmentLimit({}), 15);
  assert.equal(dailyLiveAssessmentLimit({ AI_LIVE_ASSESSMENTS_PER_DAY: '12' }), 12);
  assert.equal(dailyLiveAssessmentLimit({ AI_LIVE_ASSESSMENTS_PER_DAY: 'nope' }), 15);
});

test('demo assessment starts without database writes and contains ten questions', async () => {
  let sqlCalls = 0;
  const sql = () => { sqlCalls += 1; return Promise.resolve([]); };
  const assessment = await createInstantCuratedAssessment(sql, 'demo-user', { designation: 'Field Enumerator' }, 'instant-demo');
  assert.equal(assessment.questionCount, 10);
  assert.equal(assessment.generationMode, 'instant-demo');
  assert.match(assessment.assessmentId, /^assessment:demo-user:field_enumerator:/);
  assert.equal(sqlCalls, 0);
});

test('instant demo submission scores deterministically', async () => {
  const writes = [];
  const sql = (strings, ...values) => { writes.push({ strings, values }); return Promise.resolve([]); };
  const assessment = await createInstantCuratedAssessment(sql, '2', { designation: 'Field Enumerator' }, 'instant-demo');
  const answersBySub = {
    sampling_basics: 'B',
    questionnaire_administration: 'B',
    field_protocols: 'C',
    validation_consistency: 'C',
    nonresponse_error_handling: 'B',
    descriptive_statistics: 'B',
    tables_charts_interpretation: 'A',
    digital_survey_tools: 'B',
    data_confidentiality: 'C',
    reporting_documentation: 'B',
  };
  const answers = assessment.questions.map((question) => ({
    questionId: question.questionId,
    selectedOption: answersBySub[question.subCompetencyId],
  }));
  const result = await submitInstantCuratedAssessment(sql, '2', { assessmentId: assessment.assessmentId, answers });
  assert.equal(result.overallScore, 100);
  assert.equal(result.correctAnswers, 10);
  assert.equal(result.competencies.length, 4);
  assert.equal(result.recommendations.courses.length, 3);
  assert.equal(writes.length, 4);
});
