-- GyanSetu competency assessment persistence
-- Apply after 001_auth_profile_schema.sql.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS baseline_assessment_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role_id TEXT;

CREATE TABLE IF NOT EXISTS assessment_sessions (
  assessment_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  assessment_type TEXT NOT NULL,
  grading_questions_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assessment_attempts (
  assessment_id TEXT PRIMARY KEY REFERENCES assessment_sessions(assessment_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  assessment_type TEXT NOT NULL,
  overall_score NUMERIC(6,2) NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competency_results (
  id BIGSERIAL PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessment_attempts(assessment_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL,
  competency_name TEXT NOT NULL,
  current_score NUMERIC(6,2) NOT NULL,
  required_score NUMERIC(6,2) NOT NULL,
  gap NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, competency_id)
);

CREATE TABLE IF NOT EXISTS sub_competency_results (
  id BIGSERIAL PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessment_attempts(assessment_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL,
  sub_competency_id TEXT NOT NULL,
  sub_competency_name TEXT NOT NULL,
  current_score NUMERIC(6,2) NOT NULL,
  required_score NUMERIC(6,2) NOT NULL,
  gap NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, sub_competency_id)
);

CREATE TABLE IF NOT EXISTS learning_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user_created ON assessment_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user_created ON assessment_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competency_results_user_created ON competency_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_competency_results_user_created ON sub_competency_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_activity_user ON learning_activity(user_id, completed_at DESC);
