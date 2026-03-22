-- Composite index for main test list query:
-- WHERE user_id = ? ORDER BY date DESC
-- Covers both filter and sort in one index scan.
CREATE INDEX IF NOT EXISTS idx_tests_user_date ON tests(user_id, date DESC);

-- Composite index for category + user filter
CREATE INDEX IF NOT EXISTS idx_tests_user_category ON tests(user_id, category);

-- Index for parameter history endpoint:
-- JOIN tests t ON t.id = p.test_id WHERE t.user_id = ? AND p.name = ?
CREATE INDEX IF NOT EXISTS idx_params_name_test ON test_parameters(name, test_id);

-- Index for token expiry check in password reset validation
CREATE INDEX IF NOT EXISTS idx_reset_expires ON password_reset_tokens(expires_at);
