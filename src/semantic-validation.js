const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

export const DEFAULT_EMBEDDING_MODEL = 'sentence-transformers/all-minilm-l12-v2';
export const EMBEDDING_DIMENSIONS = 384;
export const DEFAULT_SEMANTIC_THRESHOLD = 0.55;

function normalizeThreshold(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return DEFAULT_SEMANTIC_THRESHOLD;
  return parsed;
}

export function semanticThreshold(env = {}) {
  return normalizeThreshold(env.SEMANTIC_VALIDATION_THRESHOLD);
}

export function embeddingModel(env = {}) {
  return String(env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim();
}

export function vectorLiteral(values) {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding.`);
  }
  const normalized = values.map((value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Embedding contains a non-finite value.');
    return number;
  });
  return `[${normalized.join(',')}]`;
}

export async function embedTexts(env, inputs, fetchImpl = fetch) {
  if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured.');

  const texts = Array.isArray(inputs) ? inputs : [inputs];
  if (!texts.length || texts.some((item) => !String(item || '').trim())) {
    throw new Error('Embedding input must contain non-empty text.');
  }

  const response = await fetchImpl(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'content-type': 'application/json',
      'http-referer': 'https://sih26101.stoicsolutions-in.workers.dev',
      'x-title': 'GyanSetu',
    },
    body: JSON.stringify({
      model: embeddingModel(env),
      input: texts.map((item) => String(item).trim()),
      encoding_format: 'float',
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `OpenRouter embeddings request failed (${response.status}).`;
    throw new Error(detail);
  }

  const rows = Array.isArray(payload.data) ? [...payload.data] : [];
  rows.sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  if (rows.length !== texts.length) throw new Error('Embedding provider returned an unexpected item count.');

  return rows.map((row) => {
    vectorLiteral(row.embedding);
    return row.embedding.map(Number);
  });
}

function conceptEmbeddingText(concept) {
  return [
    concept.competencyName ? `Competency: ${concept.competencyName}.` : '',
    concept.subCompetencyName ? `Sub-competency: ${concept.subCompetencyName}.` : '',
    String(concept.conceptText || '').trim(),
  ].filter(Boolean).join(' ');
}

export async function upsertCompetencyConcepts(sql, env, concepts, fetchImpl = fetch) {
  if (!Array.isArray(concepts) || !concepts.length) return [];

  const normalized = concepts.map((concept) => ({
    frameworkVersion: String(concept.frameworkVersion || '1.0'),
    roleId: String(concept.roleId || '').trim(),
    competencyId: String(concept.competencyId || '').trim(),
    subCompetencyId: String(concept.subCompetencyId || '').trim(),
    competencyName: String(concept.competencyName || '').trim() || null,
    subCompetencyName: String(concept.subCompetencyName || '').trim() || null,
    conceptText: String(concept.conceptText || '').trim(),
    requiredLevel: concept.requiredLevel == null ? null : Number(concept.requiredLevel),
  }));

  for (const concept of normalized) {
    if (!concept.roleId || !concept.competencyId || !concept.subCompetencyId || !concept.conceptText) {
      throw new Error('Concept metadata is incomplete.');
    }
    if (concept.requiredLevel != null && ![1, 2, 3, 4].includes(concept.requiredLevel)) {
      throw new Error('requiredLevel must be 1, 2, 3, or 4.');
    }
  }

  const embeddings = await embedTexts(env, normalized.map(conceptEmbeddingText), fetchImpl);
  const model = embeddingModel(env);
  const saved = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const concept = normalized[index];
    const literal = vectorLiteral(embeddings[index]);
    const rows = await sql`
      INSERT INTO competency_concepts (
        framework_version, role_id, competency_id, sub_competency_id,
        competency_name, sub_competency_name, concept_text, required_level,
        embedding_model, embedding, embedded_at, updated_at
      ) VALUES (
        ${concept.frameworkVersion}, ${concept.roleId}, ${concept.competencyId}, ${concept.subCompetencyId},
        ${concept.competencyName}, ${concept.subCompetencyName}, ${concept.conceptText}, ${concept.requiredLevel},
        ${model}, ${literal}::vector, now(), now()
      )
      ON CONFLICT (framework_version, role_id, competency_id, sub_competency_id)
      DO UPDATE SET
        competency_name = EXCLUDED.competency_name,
        sub_competency_name = EXCLUDED.sub_competency_name,
        concept_text = EXCLUDED.concept_text,
        required_level = EXCLUDED.required_level,
        embedding_model = EXCLUDED.embedding_model,
        embedding = EXCLUDED.embedding,
        embedded_at = now(),
        updated_at = now()
      RETURNING id, competency_id, sub_competency_id
    `;
    saved.push(rows[0]);
  }

  return saved;
}

export async function validateQuestionSemantic(sql, env, input, fetchImpl = fetch) {
  const roleId = String(input.roleId || '').trim();
  const frameworkVersion = String(input.frameworkVersion || '1.0');
  const expectedCompetencyId = String(input.competencyId || '').trim();
  const expectedSubCompetencyId = String(input.subCompetencyId || '').trim();
  const questionText = String(input.questionText || '').trim();
  const threshold = normalizeThreshold(input.threshold ?? semanticThreshold(env));

  if (!roleId || !expectedCompetencyId || !expectedSubCompetencyId || !questionText) {
    throw new Error('Question validation metadata is incomplete.');
  }

  const [embedding] = await embedTexts(env, [questionText], fetchImpl);
  const literal = vectorLiteral(embedding);
  const model = embeddingModel(env);

  const matches = await sql`
    SELECT
      competency_id,
      sub_competency_id,
      competency_name,
      sub_competency_name,
      1 - (embedding <=> ${literal}::vector) AS similarity
    FROM competency_concepts
    WHERE framework_version = ${frameworkVersion}
      AND role_id = ${roleId}
      AND embedding_model = ${model}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT 5
  `;

  if (!matches.length) {
    return {
      passed: false,
      status: 'needs_review',
      reason: 'No competency embeddings are available for this role yet.',
      threshold,
      embeddingModel: model,
      questionEmbedding: embedding,
      expectedRank: null,
      expectedSimilarity: null,
      topMatch: null,
      matches: [],
    };
  }

  const expectedIndex = matches.findIndex((match) =>
    match.competency_id === expectedCompetencyId && match.sub_competency_id === expectedSubCompetencyId);
  const expectedMatch = expectedIndex >= 0 ? matches[expectedIndex] : null;
  const expectedSimilarity = expectedMatch ? Number(expectedMatch.similarity) : null;
  const expectedRank = expectedIndex >= 0 ? expectedIndex + 1 : null;
  const passed = expectedRank === 1 && expectedSimilarity != null && expectedSimilarity >= threshold;

  return {
    passed,
    status: passed ? 'validated' : 'needs_review',
    reason: passed
      ? 'Expected sub-competency is the strongest semantic match and clears the threshold.'
      : 'Expected sub-competency is not the strongest semantic match or does not clear the threshold.',
    threshold,
    embeddingModel: model,
    questionEmbedding: embedding,
    expectedRank,
    expectedSimilarity,
    topMatch: matches[0] || null,
    matches,
  };
}

export async function persistQuestionValidation(sql, question, validation) {
  const options = Array.isArray(question.options) ? question.options : [];
  if (options.length !== 4) throw new Error('A question-bank MCQ must contain exactly four options.');

  const questionId = String(question.questionId || '').trim();
  const competencyId = String(question.competencyId || '').trim();
  const subCompetencyId = String(question.subCompetencyId || '').trim();
  const questionText = String(question.questionText || '').trim();
  const correctOption = String(question.correctOption || '').trim().toUpperCase();
  if (!questionId || !competencyId || !subCompetencyId || !questionText || !['A', 'B', 'C', 'D'].includes(correctOption)) {
    throw new Error('Question-bank metadata is incomplete.');
  }

  const embedding = vectorLiteral(validation.questionEmbedding);
  const optionsJson = JSON.stringify(options);
  const rows = await sql`
    INSERT INTO question_bank (
      question_id, competency_id, sub_competency_id, question_text, options_json,
      correct_option, explanation, difficulty, source_type, source_ref,
      validation_status, embedding_model, question_embedding, semantic_similarity,
      semantic_rank, validation_threshold, validation_reason, validated_at, updated_at
    ) VALUES (
      ${questionId}, ${competencyId}, ${subCompetencyId}, ${questionText}, ${optionsJson}::jsonb,
      ${correctOption}, ${question.explanation || null}, ${question.difficulty || null},
      ${question.sourceType || 'ai'}, ${question.sourceRef || null},
      ${validation.status}, ${validation.embeddingModel}, ${embedding}::vector,
      ${validation.expectedSimilarity}, ${validation.expectedRank}, ${validation.threshold},
      ${validation.reason}, now(), now()
    )
    ON CONFLICT (question_id) DO UPDATE SET
      competency_id = EXCLUDED.competency_id,
      sub_competency_id = EXCLUDED.sub_competency_id,
      question_text = EXCLUDED.question_text,
      options_json = EXCLUDED.options_json,
      correct_option = EXCLUDED.correct_option,
      explanation = EXCLUDED.explanation,
      difficulty = EXCLUDED.difficulty,
      source_type = EXCLUDED.source_type,
      source_ref = EXCLUDED.source_ref,
      validation_status = EXCLUDED.validation_status,
      embedding_model = EXCLUDED.embedding_model,
      question_embedding = EXCLUDED.question_embedding,
      semantic_similarity = EXCLUDED.semantic_similarity,
      semantic_rank = EXCLUDED.semantic_rank,
      validation_threshold = EXCLUDED.validation_threshold,
      validation_reason = EXCLUDED.validation_reason,
      validated_at = now(),
      updated_at = now()
    RETURNING id
  `;
  const questionBankId = rows[0].id;

  await sql`
    INSERT INTO question_validation_results (
      question_bank_id, expected_competency_id, expected_sub_competency_id,
      matched_competency_id, matched_sub_competency_id, similarity,
      expected_rank, threshold, passed, embedding_model
    ) VALUES (
      ${questionBankId}, ${competencyId}, ${subCompetencyId},
      ${validation.topMatch?.competency_id || null}, ${validation.topMatch?.sub_competency_id || null},
      ${validation.expectedSimilarity}, ${validation.expectedRank}, ${validation.threshold},
      ${Boolean(validation.passed)}, ${validation.embeddingModel}
    )
  `;

  return { questionBankId, status: validation.status };
}
