-- GyanSetu semantic validation + question-bank vector foundation
-- Uses pgvector in Neon. Auth/profile tables are intentionally untouched.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS competency_concepts (
  id BIGSERIAL PRIMARY KEY,
  framework_version TEXT NOT NULL DEFAULT '1.0',
  role_id TEXT NOT NULL,
  competency_id TEXT NOT NULL,
  sub_competency_id TEXT NOT NULL,
  competency_name TEXT,
  sub_competency_name TEXT,
  concept_text TEXT NOT NULL,
  required_level SMALLINT CHECK (required_level BETWEEN 1 AND 4),
  embedding_model TEXT,
  embedding VECTOR(384),
  embedded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (framework_version, role_id, competency_id, sub_competency_id)
);

CREATE TABLE IF NOT EXISTS question_bank (
  id BIGSERIAL PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE,
  competency_id TEXT NOT NULL,
  sub_competency_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSONB NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation TEXT,
  difficulty TEXT,
  source_type TEXT NOT NULL DEFAULT 'ai' CHECK (source_type IN ('ai','material','manual')),
  source_ref TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','validated','rejected','needs_review')),
  embedding_model TEXT,
  question_embedding VECTOR(384),
  semantic_similarity REAL CHECK (semantic_similarity IS NULL OR (semantic_similarity >= 0 AND semantic_similarity <= 1)),
  semantic_rank INTEGER CHECK (semantic_rank IS NULL OR semantic_rank >= 1),
  validation_threshold REAL CHECK (validation_threshold IS NULL OR (validation_threshold >= 0 AND validation_threshold <= 1)),
  validation_reason TEXT,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS question_validation_results (
  id BIGSERIAL PRIMARY KEY,
  question_bank_id BIGINT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  expected_competency_id TEXT NOT NULL,
  expected_sub_competency_id TEXT NOT NULL,
  matched_competency_id TEXT,
  matched_sub_competency_id TEXT,
  similarity REAL CHECK (similarity IS NULL OR (similarity >= 0 AND similarity <= 1)),
  expected_rank INTEGER CHECK (expected_rank IS NULL OR expected_rank >= 1),
  threshold REAL NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
  passed BOOLEAN NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competency_concepts_lookup
  ON competency_concepts (framework_version, role_id, competency_id, sub_competency_id);

CREATE INDEX IF NOT EXISTS idx_question_bank_validation_status
  ON question_bank (validation_status, competency_id, sub_competency_id);

CREATE INDEX IF NOT EXISTS idx_question_validation_question
  ON question_validation_results (question_bank_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_competency_concepts_embedding_hnsw
  ON competency_concepts USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_question_bank_embedding_hnsw
  ON question_bank USING hnsw (question_embedding vector_cosine_ops)
  WHERE question_embedding IS NOT NULL;
