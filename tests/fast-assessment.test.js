import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_ENUMERATOR_ROLE } from '../src/assessment-engine.js';
import {
  dailyLiveAssessmentLimit,
  expectedCoverageKeys,
  hasCompleteRoleCoverage,
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
