require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const crypto = require('crypto');
const path        = require('path');
const compression = require('compression');

const { db, newId } = require('./db');
const { sendPasswordReset } = require('./lib/mailer');
const { validate } = require('./middleware/validate');
const { registerSchema, loginSchema, profileSchema } = require('./validators/auth.schemas');
const { testBodySchema } = require('./validators/test.schemas');
const { memberSchema } = require('./validators/member.schemas');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "blob:"],
      styleSrc:        ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:         ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      workerSrc:       ["'self'", "https://cdnjs.cloudflare.com", "blob:"],
      imgSrc:          ["'self'", "data:", "blob:"],
      connectSrc:      ["'self'", "https://api.github.com"],
      objectSrc:       ["'none'"],
      baseUri:         ["'self'"],
      formAction:      ["'self'"],
      frameAncestors:  ["'none'"],
    },
  },
}));

// Permissions-Policy: disable genuinely unused features only
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'payment=(), geolocation=()');
  next();
});

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT || '200'),
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
const START_TIME   = Date.now();
const APP_VERSION  = require('./package.json').version;

app.get('/health', (_req, res) => {
  let dbStatus = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }
  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status,
    version:   APP_VERSION,
    uptime:    Math.floor((Date.now() - START_TIME) / 1000),
    db:        dbStatus,
    timestamp: new Date().toISOString(),
  });
});

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Check blacklist
    const blacklisted = db.prepare('SELECT 1 FROM jwt_blacklist WHERE jti = ?').get(decoded.jti);
    if (blacklisted) return res.status(401).json({ error: 'Token revoked' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { email, password, name, sex, birthDate } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 12);
    const id = newId();
    db.prepare(`INSERT INTO users (id, email, password, name, sex, birth_date) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, email, hashed, name, sex || null, birthDate || null);

    const jti = crypto.randomUUID();
    const token = jwt.sign({ id, email, name, jti }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, email, name, sex: sex || null, birthDate: birthDate || null } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const jti = crypto.randomUUID();
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, jti }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birth_date } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Atomic helper: replace any existing reset token for a user
const upsertResetToken = db.transaction((userId, token, expiresAt) => {
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
});

// Password reset — step 1: request token
app.post('/api/auth/reset-password-request', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    // Always return 200 to avoid email enumeration
    if (!user) return res.json({ success: true });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString(); // 1 hour
    upsertResetToken(user.id, token, expiresAt);

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const result  = await sendPasswordReset(email.trim(), token, baseUrl);

    // Dev mode (no SMTP): return token in response so the UI can prefill it
    res.json({ success: true, ...(result.devToken ? { token: result.devToken, expiresIn: '1 час' } : {}) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Password reset — step 2: set new password
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const record = db.prepare(`
      SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token);
    if (!record) return res.status(400).json({ error: 'Invalid or expired token' });

    const hashed = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, record.user_id);
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', auth, (req, res) => {
  const { jti, exp } = req.user;
  if (jti) {
    const expiresAt = new Date(exp * 1000).toISOString();
    db.prepare('INSERT OR IGNORE INTO jwt_blacklist (jti, expires_at) VALUES (?, ?)').run(jti, expiresAt);
  }
  res.json({ success: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, email, name, sex, birth_date FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birth_date });
});

app.put('/api/auth/profile', auth, validate(profileSchema), (req, res) => {
  const { name, sex, birthDate } = req.body;
  const result = db.prepare(`
    UPDATE users SET name = ?, sex = ?, birth_date = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name, sex ?? null, birthDate ?? null, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  const user = db.prepare('SELECT id, email, name, sex, birth_date FROM users WHERE id = ?').get(req.user.id);
  res.json({ id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birth_date });
});

// ── MEMBERS ───────────────────────────────────────────────────────────────────
app.get('/api/members', auth, (req, res) => {
  const members = db.prepare('SELECT * FROM family_members WHERE user_id = ? ORDER BY created_at').all(req.user.id);
  res.json(members.map(m => ({ id: m.id, name: m.name, sex: m.sex, birthDate: m.birth_date, relation: m.relation })));
});

app.post('/api/members', auth, validate(memberSchema), (req, res) => {
  const { name, sex, birthDate, relation } = req.body;
  const id = newId();
  db.prepare(`INSERT INTO family_members (id, user_id, name, sex, birth_date, relation) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, req.user.id, name, sex || null, birthDate || null, relation || 'other');
  res.json({ id, name, sex: sex || null, birthDate: birthDate || null, relation: relation || 'other' });
});

app.put('/api/members/:id', auth, validate(memberSchema), (req, res) => {
  const { name, sex, birthDate, relation } = req.body;
  const result = db.prepare(`
    UPDATE family_members SET name = ?, sex = ?, birth_date = ?, relation = ? WHERE id = ? AND user_id = ?
  `).run(name, sex ?? null, birthDate ?? null, relation || 'other', req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id: req.params.id, name, sex: sex || null, birthDate: birthDate || null, relation: relation || 'other' });
});

app.delete('/api/members/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM family_members WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── TESTS ─────────────────────────────────────────────────────────────────────
app.get('/api/tests', auth, (req, res) => {
  const { memberId, search, category, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
  const lim = Math.min(100, parseInt(limit));

  const conditions = ['t.user_id = ?'];
  const params = [req.user.id];

  if (memberId) {
    conditions.push('t.member_id = ?'); params.push(memberId);
  } else {
    conditions.push('t.member_id IS NULL');
  }
  if (category && category !== 'all') {
    conditions.push('t.category = ?'); params.push(category);
  }
  if (dateFrom) { conditions.push('t.date >= ?'); params.push(dateFrom); }
  if (dateTo)   { conditions.push('t.date <= ?'); params.push(dateTo); }
  if (search) {
    const like = `%${search}%`;
    conditions.push(`(t.name LIKE ? OR t.lab_name LIKE ? OR t.doctor LIKE ? OR t.conclusion LIKE ?
      OR EXISTS (SELECT 1 FROM test_parameters p WHERE p.test_id = t.id AND p.name LIKE ?))`);
    params.push(like, like, like, like, like);
  }

  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) as n FROM tests t WHERE ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT t.* FROM tests t WHERE ${where} ORDER BY t.date DESC LIMIT ? OFFSET ?`)
    .all(...params, lim, offset);

  const tests = rows.map(t => ({
    ...t,
    userId: t.user_id,
    memberId: t.member_id,
    labName: t.lab_name,
    nextVisit: t.next_visit,
    createdAt: t.created_at,
    parameters: db.prepare('SELECT * FROM test_parameters WHERE test_id = ?').all(t.id).map(p => ({
      name: p.name,
      value: p.value ?? p.value_text,
      unit: p.unit,
      refLow: p.ref_min,
      refHigh: p.ref_max,
      refText: p.ref_text,
      isAbnormal: !!p.is_abnormal,
    })),
    attachments: db.prepare('SELECT id, filename, mime_type, size, data FROM attachments WHERE test_id = ?').all(t.id).map(a => ({
      id: a.id, name: a.filename, type: a.mime_type, size: a.size, data: a.data,
    })),
  }));
  res.json({ tests, total, page: parseInt(page), pages: Math.ceil(total / lim) });
});

const saveTest = db.transaction((userId, testId, body) => {
  const { date, lab, labName, doctor, category, conclusion, notes, nextVisit, memberId, parameters, attachments } = body;

  const { name } = body;
  db.prepare(`
    INSERT INTO tests (id, user_id, member_id, name, date, lab_name, doctor, category, conclusion, notes, next_visit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(testId, userId, memberId || null, name || '', date, lab || labName || null, doctor || null, category || 'other', conclusion || null, notes || null, nextVisit || null);

  for (const p of parameters || []) {
    const val = parseFloat(p.value);
    const refMin = parseFloat(p.refLow ?? p.refMin ?? p.ref_min);
    const refMax = parseFloat(p.refHigh ?? p.refMax ?? p.ref_max);
    const isAbnormal = (!isNaN(val) && !isNaN(refMin) && val < refMin) ||
                       (!isNaN(val) && !isNaN(refMax) && val > refMax) ? 1 : 0;
    db.prepare(`
      INSERT INTO test_parameters (id, test_id, name, value, value_text, unit, ref_min, ref_max, ref_text, is_abnormal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId(), testId, p.name, isNaN(val) ? null : val, isNaN(val) ? String(p.value || '') : null,
           p.unit || null, isNaN(refMin) ? null : refMin, isNaN(refMax) ? null : refMax, p.refText || null, isAbnormal);
  }

  for (const a of attachments || []) {
    db.prepare(`INSERT INTO attachments (id, test_id, filename, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(newId(), testId, a.name, a.type, a.size, a.data);
  }
});

const getTestWithParams = (testId) => {
  const t = db.prepare('SELECT * FROM tests WHERE id = ?').get(testId);
  if (!t) return null;
  return {
    ...t,
    userId: t.user_id,
    memberId: t.member_id,
    labName: t.lab_name,
    nextVisit: t.next_visit,
    createdAt: t.created_at,
    parameters: db.prepare('SELECT * FROM test_parameters WHERE test_id = ?').all(testId).map(p => ({
      name: p.name,
      value: p.value ?? p.value_text,
      unit: p.unit,
      refLow: p.ref_min,
      refHigh: p.ref_max,
      isAbnormal: !!p.is_abnormal,
    })),
  };
};

app.post('/api/tests', auth, validate(testBodySchema), (req, res) => {
  try {
    const testId = newId();
    saveTest(req.user.id, testId, req.body);
    res.json(getTestWithParams(testId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const updateTest = db.transaction((testId, userId, body) => {
  const { name, date, lab, labName, doctor, category, conclusion, notes, nextVisit } = body;
  db.prepare(`
    UPDATE tests SET name = ?, date = ?, lab_name = ?, doctor = ?, category = ?, conclusion = ?, notes = ?, next_visit = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(name || '', date, lab || labName || null, doctor || null, category || 'other', conclusion || null, notes || null, nextVisit || null, testId, userId);

  db.prepare('DELETE FROM test_parameters WHERE test_id = ?').run(testId);
  for (const p of body.parameters || []) {
    const val = parseFloat(p.value);
    const refMin = parseFloat(p.refLow ?? p.refMin ?? p.ref_min);
    const refMax = parseFloat(p.refHigh ?? p.refMax ?? p.ref_max);
    const isAbnormal = (!isNaN(val) && !isNaN(refMin) && val < refMin) ||
                       (!isNaN(val) && !isNaN(refMax) && val > refMax) ? 1 : 0;
    db.prepare(`
      INSERT INTO test_parameters (id, test_id, name, value, value_text, unit, ref_min, ref_max, ref_text, is_abnormal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId(), testId, p.name, isNaN(val) ? null : val, isNaN(val) ? String(p.value || '') : null,
           p.unit || null, isNaN(refMin) ? null : refMin, isNaN(refMax) ? null : refMax, p.refText || null, isAbnormal);
  }

  db.prepare('DELETE FROM attachments WHERE test_id = ?').run(testId);
  for (const a of body.attachments || []) {
    db.prepare(`INSERT INTO attachments (id, test_id, filename, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(newId(), testId, a.name, a.type, a.size, a.data);
  }
});

app.put('/api/tests/:id', auth, validate(testBodySchema), (req, res) => {
  try {
    const exists = db.prepare('SELECT id FROM tests WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!exists) return res.status(404).json({ error: 'Not found' });
    updateTest(req.params.id, req.user.id, req.body);
    res.json(getTestWithParams(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/tests/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM tests WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

app.get('/api/tests/parameter/:name', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.date, p.value, p.unit
    FROM test_parameters p
    JOIN tests t ON t.id = p.test_id
    WHERE t.user_id = ? AND p.name = ? AND p.value IS NOT NULL
    ORDER BY t.date ASC
  `).all(req.user.id, req.params.name);
  res.json(rows);
});

// ── EXPORT / IMPORT ───────────────────────────────────────────────────────────
app.get('/api/export', auth, (req, res) => {
  const user = db.prepare('SELECT id, email, name, sex, birth_date FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const members = db.prepare('SELECT * FROM family_members WHERE user_id = ?').all(req.user.id);
  const tests = db.prepare('SELECT * FROM tests WHERE user_id = ?').all(req.user.id).map(t => ({
    ...t,
    parameters: db.prepare('SELECT * FROM test_parameters WHERE test_id = ?').all(t.id),
    attachments: db.prepare('SELECT * FROM attachments WHERE test_id = ?').all(t.id),
  }));

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 2,
    profile: { id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birth_date },
    members: members.map(m => ({ id: m.id, name: m.name, sex: m.sex, birthDate: m.birth_date, relation: m.relation })),
    tests,
  };

  res.setHeader('Content-Disposition', `attachment; filename="medlab-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.json(payload);
});

// CSV export — all test parameters as a flat spreadsheet-friendly table
app.get('/api/export/csv', auth, (req, res) => {
  const tests = db.prepare('SELECT * FROM tests WHERE user_id = ? ORDER BY date DESC').all(req.user.id);

  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    // Wrap in quotes if contains comma, newline or quote; double internal quotes
    if (s.includes(',') || s.includes('\n') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = ['Дата', 'Название анализа', 'Категория', 'Лаборатория', 'Врач', 'Показатель', 'Значение', 'Единица', 'Норма нижн.', 'Норма верхн.'];
  const rows   = [header.map(escape).join(',')];

  for (const t of tests) {
    const params = db.prepare('SELECT * FROM test_parameters WHERE test_id = ?').all(t.id);
    if (!params.length) {
      rows.push([t.date, t.name, t.category, t.lab_name || '', t.doctor || '', '', '', '', '', ''].map(escape).join(','));
    } else {
      for (const p of params) {
        rows.push([t.date, t.name, t.category, t.lab_name || '', t.doctor || '', p.name, p.value ?? p.value_text, p.unit, p.ref_min, p.ref_max].map(escape).join(','));
      }
    }
  }

  const csv      = '\uFEFF' + rows.join('\r\n'); // BOM for Excel UTF-8
  const filename = `medlab-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

app.post('/api/import', auth, (req, res) => {
  try {
    const { profile, members, tests } = req.body;
    if (!tests || !Array.isArray(tests)) return res.status(400).json({ error: 'Invalid backup format' });

    const doImport = db.transaction(() => {
      if (profile) {
        db.prepare(`UPDATE users SET name = COALESCE(?, name), sex = COALESCE(?, sex), birth_date = COALESCE(?, birth_date) WHERE id = ?`)
          .run(profile.name || null, profile.sex || null, profile.birthDate || null, req.user.id);
      }

      if (members && Array.isArray(members)) {
        for (const m of members) {
          db.prepare(`INSERT OR IGNORE INTO family_members (id, user_id, name, sex, birth_date, relation) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(m.id || newId(), req.user.id, m.name, m.sex || null, m.birthDate || null, m.relation || 'other');
        }
      }

      let imported = 0;
      for (const t of tests) {
        const exists = db.prepare('SELECT id FROM tests WHERE id = ? AND user_id = ?').get(t.id, req.user.id);
        if (!exists) {
          saveTest(req.user.id, t.id, {
            date: t.date, lab: t.lab_name || t.lab, doctor: t.doctor, category: t.category,
            conclusion: t.conclusion, notes: t.notes, nextVisit: t.next_visit || t.nextVisit,
            memberId: t.member_id || t.memberId,
            parameters: t.parameters || [],
            attachments: t.attachments || [],
          });
          imported++;
        }
      }
      return { imported, skipped: tests.length - imported };
    });

    const result = doImport();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`MedLab running on http://localhost:${PORT}`));
