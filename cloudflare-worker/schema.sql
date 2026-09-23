CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  client_hash TEXT
  ,image BLOB
  ,content_type TEXT
  ,match_gender TEXT NOT NULL DEFAULT 'auto' CHECK(match_gender IN ('auto','male','female'))
);
CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS jobs_client_created ON jobs(client_hash, created_at);
