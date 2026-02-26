CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  rate_limit   INT NOT NULL DEFAULT 60,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url               TEXT NOT NULL,
  canonical_url     TEXT,
  url_hash          TEXT NOT NULL,
  content_hash      TEXT,
  status_code       INT,
  title             TEXT,
  description       TEXT,
  markdown          TEXT,
  raw_html          TEXT,
  renderer          TEXT CHECK (renderer IN ('httpx','playwright')),
  links_internal    TEXT[],
  links_external    TEXT[],
  word_count        INT,
  fetch_duration_ms INT,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_code        TEXT,
  error_message     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_url_hash ON pages(url_hash);
CREATE INDEX IF NOT EXISTS idx_pages_content_hash ON pages(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pages_fetched_at ON pages(fetched_at);

CREATE TABLE IF NOT EXISTS jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id       UUID NOT NULL REFERENCES api_keys(id),
  type             TEXT NOT NULL CHECK (type IN ('map','agent_extract')),
  status           TEXT NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','completed','failed','cancelled')),
  input_params     JSONB NOT NULL,
  idempotency_key  TEXT UNIQUE,
  error_code       TEXT,
  error_message    TEXT,
  pages_discovered INT DEFAULT 0,
  pages_total      INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_api_key ON jobs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_pages (
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES pages(id),
  depth INT NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, page_id)
);
CREATE INDEX IF NOT EXISTS idx_job_pages_job ON job_pages(job_id);

CREATE TABLE IF NOT EXISTS events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id),
  job_id     UUID,
  event_type TEXT NOT NULL,
  level      TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  message    TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_api_key ON events(api_key_id);
CREATE INDEX IF NOT EXISTS idx_events_job ON events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
