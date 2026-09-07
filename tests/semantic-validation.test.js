import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  embedTexts,
  validateQuestionSemantic,
  vectorLiteral,
} from '../src/semantic-validation.js';

function fakeEmbedding(fill = 0.1) {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);
}

test('vectorLiteral accepts exactly 384 finite values', () => {
  const literal = vectorLiteral(fakeEmbedding());
  assert.ok(literal.startsWith('['));
  assert.ok(literal.endsWith(']'));
  assert.equal(literal.split(',').length, EMBEDDING_DIMENSIONS);
});

test('vectorLiteral rejects the wrong embedding dimension', () => {
  assert.throws(() => vectorLiteral([0.1, 0.2]), /384-dimension/);
});

test('embedTexts uses the configured OpenRouter embedding model', async () => {
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return {
          data: [
            { index: 0, embedding: fakeEmbedding(0.2) },
            { index: 1, embedding: fakeEmbedding(0.3) },
          ],
        };
      },
    };
  };

  const result = await embedTexts(
    { OPENROUTER_API_KEY: 'test-key' },
    ['question one', 'question two'],
    fetchImpl,
  );

  assert.equal(requestBody.model, DEFAULT_EMBEDDING_MODEL);
  assert.deepEqual(requestBody.input, ['question one', 'question two']);
  assert.equal(result.length, 2);
  assert.equal(result[0].length, EMBEDDING_DIMENSIONS);
});

test('semantic validation passes only when expected concept is top match and clears threshold', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { data: [{ index: 0, embedding: fakeEmbedding(0.4) }] };
    },
  });

  const sql = async () => [
    {
      competency_id: 'statistics',
      sub_competency_id: 'probability',
      competency_name: 'Statistics',
      sub_competency_name: 'Probability',
      similarity: 0.81,
    },
    {
      competency_id: 'statistics',
      sub_competency_id: 'descriptive_statistics',
      competency_name: 'Statistics',
      sub_competency_name: 'Descriptive Statistics',
      similarity: 0.63,
    },
  ];

  const result = await validateQuestionSemantic(
    sql,
    { OPENROUTER_API_KEY: 'test-key', SEMANTIC_VALIDATION_THRESHOLD: '0.55' },
    {
      roleId: 'data_analyst',
      frameworkVersion: '1.0',
      competencyId: 'statistics',
      subCompetencyId: 'probability',
      questionText: 'Which probability rule applies when two independent events occur together?',
    },
    fetchImpl,
  );

  assert.equal(result.passed, true);
  assert.equal(result.status, 'validated');
  assert.equal(result.expectedRank, 1);
  assert.equal(result.expectedSimilarity, 0.81);
});
