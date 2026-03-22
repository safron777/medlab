CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);
