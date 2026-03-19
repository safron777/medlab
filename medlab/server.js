const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'medlab-super-secret-key-2024';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TESTS_FILE = path.join(DATA_DIR, 'tests.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(TESTS_FILE)) fs.writeFileSync(TESTS_FILE, JSON.stringify([]));

// Simple file-based DB helpers
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Relax CSP for fonts and CDN resources
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "blob:"],
      workerSrc:  ["'self'", "https://cdnjs.cloudflare.com", "blob:"],
      imgSrc:     ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://api.github.com"],
    },
  },
}));

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, sex, birthDate } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });

    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 12);
    const user = { id: Date.now().toString(), email, password: hashed, name, sex: sex || null, birthDate: birthDate || null, createdAt: new Date().toISOString() };
    users.push(user);
    writeJSON(USERS_FILE, users);

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birthDate } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birthDate } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, email: user.email, name: user.name, sex: user.sex || null, birthDate: user.birthDate || null });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, sex, birthDate } = req.body;
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.id === req.user.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    if (!name) return res.status(400).json({ error: 'Name required' });
    users[idx].name = name;
    if (sex !== undefined) users[idx].sex = sex;
    if (birthDate !== undefined) users[idx].birthDate = birthDate;
    writeJSON(USERS_FILE, users);
    const u = users[idx];
    res.json({ id: u.id, email: u.email, name: u.name, sex: u.sex || null, birthDate: u.birthDate || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MEMBERS ROUTES ────────────────────────────────────────────────────────────
app.get('/api/members', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user.members || []);
});

app.post('/api/members', auth, (req, res) => {
  const { name, sex, birthDate, relation } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (!users[idx].members) users[idx].members = [];
  const member = { id: Date.now().toString(), name, sex: sex || null, birthDate: birthDate || null, relation: relation || 'other' };
  users[idx].members.push(member);
  writeJSON(USERS_FILE, users);
  res.json(member);
});

app.put('/api/members/:id', auth, (req, res) => {
  const { name, sex, birthDate, relation } = req.body;
  const users = readJSON(USERS_FILE);
  const uIdx = users.findIndex(u => u.id === req.user.id);
  if (uIdx === -1) return res.status(404).json({ error: 'Not found' });
  const members = users[uIdx].members || [];
  const mIdx = members.findIndex(m => m.id === req.params.id);
  if (mIdx === -1) return res.status(404).json({ error: 'Member not found' });
  members[mIdx] = { ...members[mIdx], name: name || members[mIdx].name, sex, birthDate, relation };
  users[uIdx].members = members;
  writeJSON(USERS_FILE, users);
  res.json(members[mIdx]);
});

app.delete('/api/members/:id', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const uIdx = users.findIndex(u => u.id === req.user.id);
  if (uIdx === -1) return res.status(404).json({ error: 'Not found' });
  users[uIdx].members = (users[uIdx].members || []).filter(m => m.id !== req.params.id);
  writeJSON(USERS_FILE, users);
  // Remove member's tests
  const tests = readJSON(TESTS_FILE);
  writeJSON(TESTS_FILE, tests.filter(t => !(t.userId === req.user.id && t.memberId === req.params.id)));
  res.json({ success: true });
});

// ── TESTS ROUTES ─────────────────────────────────────────────────────────────
app.get('/api/tests', auth, (req, res) => {
  const tests = readJSON(TESTS_FILE);
  const { memberId } = req.query;
  let userTests = tests.filter(t => t.userId === req.user.id);
  // null/absent memberId → owner's own tests (no memberId field)
  if (memberId) {
    userTests = userTests.filter(t => t.memberId === memberId);
  } else {
    userTests = userTests.filter(t => !t.memberId);
  }
  res.json(userTests.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/tests', auth, (req, res) => {
  const tests = readJSON(TESTS_FILE);
  const test = {
    id: Date.now().toString(),
    userId: req.user.id,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  tests.push(test);
  writeJSON(TESTS_FILE, tests);
  res.json(test);
});

app.put('/api/tests/:id', auth, (req, res) => {
  const tests = readJSON(TESTS_FILE);
  const idx = tests.findIndex(t => t.id === req.params.id && t.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tests[idx] = { ...tests[idx], ...req.body, id: req.params.id, userId: req.user.id };
  writeJSON(TESTS_FILE, tests);
  res.json(tests[idx]);
});

app.delete('/api/tests/:id', auth, (req, res) => {
  const tests = readJSON(TESTS_FILE);
  const exists = tests.find(t => t.id === req.params.id && t.userId === req.user.id);
  if (!exists) return res.status(404).json({ error: 'Not found' });
  writeJSON(TESTS_FILE, tests.filter(t => t.id !== req.params.id));
  res.json({ success: true });
});

// Get parameter history for charting
app.get('/api/tests/parameter/:name', auth, (req, res) => {
  const tests = readJSON(TESTS_FILE);
  const userTests = tests.filter(t => t.userId === req.user.id);
  const history = [];
  for (const test of userTests) {
    const param = test.parameters?.find(p => p.name === req.params.name);
    if (param) history.push({ date: test.date, value: param.value, unit: param.unit });
  }
  res.json(history.sort((a, b) => new Date(a.date) - new Date(b.date)));
});

// ── EXPORT / IMPORT ──────────────────────────────────────────────────────────
app.get('/api/export', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const allTests = readJSON(TESTS_FILE);
  const userTests = allTests.filter(t => t.userId === req.user.id);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    profile: { id: user.id, email: user.email, name: user.name, sex: user.sex, birthDate: user.birthDate },
    members: user.members || [],
    tests: userTests,
  };

  res.setHeader('Content-Disposition', `attachment; filename="medlab-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.json(payload);
});

app.post('/api/import', auth, (req, res) => {
  try {
    const { profile, members, tests } = req.body;
    if (!tests || !Array.isArray(tests)) return res.status(400).json({ error: 'Invalid backup format' });

    // Update profile fields if provided
    const users = readJSON(USERS_FILE);
    const uIdx = users.findIndex(u => u.id === req.user.id);
    if (uIdx === -1) return res.status(404).json({ error: 'Not found' });
    if (profile) {
      if (profile.name)      users[uIdx].name      = profile.name;
      if (profile.sex)       users[uIdx].sex       = profile.sex;
      if (profile.birthDate) users[uIdx].birthDate = profile.birthDate;
    }
    if (members && Array.isArray(members)) users[uIdx].members = members;
    writeJSON(USERS_FILE, users);

    // Merge tests: skip duplicates by id, re-assign userId to current user
    const allTests = readJSON(TESTS_FILE);
    const existingIds = new Set(allTests.filter(t => t.userId === req.user.id).map(t => t.id));
    let imported = 0;
    for (const t of tests) {
      if (!existingIds.has(t.id)) {
        allTests.push({ ...t, userId: req.user.id });
        imported++;
      }
    }
    writeJSON(TESTS_FILE, allTests);

    res.json({ success: true, imported, skipped: tests.length - imported });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve SPA for all non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`MedLab running on http://localhost:${PORT}`));
