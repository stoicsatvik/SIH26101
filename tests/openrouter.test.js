import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuestionResponseSchema,
  generateAssessmentQuestions,
  getOpenRouterKeyStatus,
} from '../src/openrouter.js';

test('key status uses the authenticated OpenRouter key endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { usage: 0, limit_remaining: 50 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const status = await getOpenRouterKeyStatus({ apiKey: 'sk-test', fetchImpl });
  assert.equal(status.ok, true);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/key');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
});

test('structured-output schema locks the exact question count', () => {
  const schema = buildQuestionResponseSchema(20);
  const questions = schema.json_schema.schema.properties.questions;
  assert.equal(questions.minItems, 20);
  assert.equal(questions.maxItems, 20);
});

test('generation sends no user PII and parses structured JSON', async () => {
  const role = {
    role_id: 'data_analyst',
    role_name: 'Data Analyst',
    domain: 'Data and Analytics',
    competencies: [
      {
        competency_id: 'statistics',
        name: 'Statistics',
        sub_competencies: [
          {
            sub_competency_id: 'probability',
            name: 'Probability',
            definition: 'Probability concepts',
            required_level: 2,
          },
        ],
      },
    ],
  };
  const plan = {
    question_count: 1,
    coverage: [
      { competency_id: 'statistics', sub_competency_id: 'probability', required_level: 2, question_count: 1 },
    ],
  };

  let requestBody;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [{ question_id: 'Q1' }] }) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const questions = await generateAssessmentQuestions({ apiKey: 'sk-test', role, plan, fetchImpl });
  assert.deepEqual(questions, [{ question_id: 'Q1' }]);
  assert.equal(requestBody.model, 'openrouter/free');
  assert.equal(requestBody.response_format.type, 'json_schema');
  const serialized = JSON.stringify(requestBody);
  assert.equal(serialized.includes('email'), false);
  assert.equal(serialized.includes('password'), false);
  assert.equal(serialized.includes('employee_id'), false);
});
