-- SIH26101 assessment and competency-result schema
-- Target: Neon PostgreSQL
-- Assumes migrations/001_auth_profile_schema.sql has already been applied.

CREATE TABLE IF NOT EXISTS assessments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  framework_version TEXT NOT NULL,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('diagnostic', 'reassessment')),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'failed')),
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  model_provider TEXT,
  model_name TEXT,
  overall_score NUMERIC(6,2) CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  correct_answer TEXT NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  competency_id TEXT NOT NULL,
  sub_competency_id TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  explanation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS user_answers (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  selected_answer TEXT CHECK (selected_answer IS NULL OR selected_answer IN ('A', 'B', 'C', 'D')),
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS sub_competency_results (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL,
  sub_competency_id TEXT NOT NULL,
  required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 4),
  questions_attempted INTEGER NOT NULL DEFAULT 0 CHECK (questions_attempted >= 0),
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  total_questions INTEGER NOT NULL CHECK (total_questions > 0),
  score_percentage NUMERIC(6,2) NOT NULL CHECK (score_percentage >= 0 AND score_percentage <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, sub_competency_id)
);

CREATE TABLE IF NOT EXISTS competency_results (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL,
  required_level INTEGER NOT NULL CHECK (required_level BETWEEN 1 AND 4),
  current_score NUMERIC(6,2) NOT NULL CHECK (current_score >= 0 AND current_score <= 100),
  current_level INTEGER CHECK (current_level IS NULL OR current_level BETWEEN 1 AND 4),
  gap_status TEXT NOT NULL DEFAULT 'mapping_required' CHECK (gap_status IN ('mapping_required', 'gap', 'met', 'exceeded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, competency_id)
);

CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_assessments_user_created_at ON assessments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_assessment_id ON assessment_questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_competency ON assessment_questions(competency_id, sub_competency_id);
CREATE INDEX IF NOT EXISTS idx_user_answers_assessment_id ON user_answers(assessment_id);
CREATE INDEX IF NOT EXISTS idx_sub_competency_results_assessment_id ON sub_competency_results(assessment_id);
CREATE INDEX IF NOT EXISTS idx_competency_results_assessment_id ON competency_results(assessment_id);
