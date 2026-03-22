CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  sex         TEXT CHECK(sex IN ('male', 'female', 'other', NULL)),
  birth_date  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jwt_blacklist (
  jti        TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_expires ON jwt_blacklist(expires_at);

CREATE TABLE IF NOT EXISTS family_members (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sex         TEXT CHECK(sex IN ('male', 'female', 'other', NULL)),
  birth_date  TEXT,
  relation    TEXT DEFAULT 'other',
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_family_user ON family_members(user_id);

CREATE TABLE IF NOT EXISTS tests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id   TEXT REFERENCES family_members(id) ON DELETE SET NULL,
  date        TEXT NOT NULL,
  lab_name    TEXT,
  doctor      TEXT,
  category    TEXT NOT NULL DEFAULT 'other',
  conclusion  TEXT,
  notes       TEXT,
  next_visit  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tests_user ON tests(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_date ON tests(date);
CREATE INDEX IF NOT EXISTS idx_tests_member ON tests(member_id);

CREATE TABLE IF NOT EXISTS test_parameters (
  id          TEXT PRIMARY KEY,
  test_id     TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  value       REAL,
  value_text  TEXT,
  unit        TEXT,
  ref_min     REAL,
  ref_max     REAL,
  ref_text    TEXT,
  is_abnormal INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_params_test ON test_parameters(test_id);
CREATE INDEX IF NOT EXISTS idx_params_name ON test_parameters(name);

CREATE TABLE IF NOT EXISTS attachments (
  id        TEXT PRIMARY KEY,
  test_id   TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  filename  TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size      INTEGER NOT NULL,
  data      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attach_test ON attachments(test_id);
