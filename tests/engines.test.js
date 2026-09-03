import test from 'node:test';
import assert from 'node:assert/strict';
import { findRole, getFrameworkVersion, listRoles, resolveRoleFromCandidates } from '../src/competency-service.js';
import { buildGapAnalysis } from '../src/gap-engine.js';
import { recommendCourses } from '../src/recommendation-engine.js';
import { isAssessmentApiPath } from '../src/assessment-api.js';

test('competency service resolves role ids and names from the committed framework', () => {
  assert.ok(getFrameworkVersion());
  assert.ok(listRoles().length > 0);
  assert.equal(findRole('data_analyst')?.role_id, 'data_analyst');
  assert.equal(findRole('Data Analyst')?.role_id, 'data_analyst');
  assert.equal(resolveRoleFromCandidates(['unknown', 'Data Analyst'])?.role_id, 'data_analyst');
});

test('gap engine refuses to invent a proficiency mapping', () => {
  const required = new Map([['probability', 3]]);
  const gaps = buildGapAnalysis({
    subCompetencyResults: [{
      competency_id: 'statistics',
      sub_competency_id: 'probability',
      score_percentage: 62,
    }],
    requiredLevels: required,
  });

  assert.deepEqual(gaps[0], {
    competency_id: 'statistics',
    sub_competency_id: 'probability',
    required_level: 3,
    current_score: 62,
    current_level: null,
    gap_status: 'mapping_required',
  });
});

test('gap engine becomes deterministic once an explicit mapper is supplied', () => {
  const mapper = (score) => (score >= 80 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1);
  const required = new Map([
    ['probability', 3],
    ['statistical_inference', 3],
  ]);
  const gaps = buildGapAnalysis({
    subCompetencyResults: [
      { competency_id: 'statistics', sub_competency_id: 'probability', score_percentage: 45 },
      { competency_id: 'statistics', sub_competency_id: 'statistical_inference', score_percentage: 72 },
    ],
    requiredLevels: required,
    scoreToLevel: mapper,
  });

  assert.equal(gaps[0].sub_competency_id, 'probability');
  assert.equal(gaps[0].gap_status, 'gap');
  assert.equal(gaps[1].gap_status, 'met');
});

test('recommendation engine only uses confirmed gap entries', () => {
  const recommendations = recommendCourses({
    gaps: [
      { sub_competency_id: 'probability', required_level: 3, current_level: 1, gap_status: 'gap' },
      { sub_competency_id: 'sql', required_level: 3, current_level: null, gap_status: 'mapping_required' },
    ],
    courses: [
      { course_id: 'stats-1', title: 'Probability Foundations', sub_competency_ids: ['probability'] },
      { course_id: 'db-1', title: 'SQL Basics', sub_competency_ids: ['sql'] },
    ],
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].course_id, 'stats-1');
});

test('assessment route matcher includes backend-only assessment endpoints', () => {
  assert.equal(isAssessmentApiPath('/api/competency/roles'), true);
  assert.equal(isAssessmentApiPath('/api/assessments/start'), true);
  assert.equal(isAssessmentApiPath('/api/assessments/42'), true);
  assert.equal(isAssessmentApiPath('/api/assessments/42/submit'), true);
  assert.equal(isAssessmentApiPath('/api/assessments/42/results'), true);
  assert.equal(isAssessmentApiPath('/api/users/me/competency-profile'), true);
  assert.equal(isAssessmentApiPath('/api/not-real'), false);
});
