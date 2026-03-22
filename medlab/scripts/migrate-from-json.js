/**
 * One-time migration script: JSON files → SQLite
 * Usage: node scripts/migrate-from-json.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TESTS_FILE = path.join(DATA_DIR, 'tests.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backup-pre-migration');

const newId = () => crypto.randomUUID();

const readJSON = (file) => {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

const backup = () => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(USERS_FILE)) fs.copyFileSync(USERS_FILE, path.join(BACKUP_DIR, `users-${ts}.json`));
  if (fs.existsSync(TESTS_FILE)) fs.copyFileSync(TESTS_FILE, path.join(BACKUP_DIR, `tests-${ts}.json`));
  console.log(`✓ Backup saved to ${BACKUP_DIR}`);
};

const migrate = db.transaction(() => {
  const users = readJSON(USERS_FILE);
  const tests = readJSON(TESTS_FILE);

  console.log(`Found: ${users.length} users, ${tests.length} tests`);

  // Build id mapping (old numeric id → new uuid or keep if needed for FK)
  // We keep old IDs to preserve references from tests to users/members
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password, name, sex, birth_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO family_members (id, user_id, name, sex, birth_date, relation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTest = db.prepare(`
    INSERT OR IGNORE INTO tests (id, user_id, member_id, date, lab_name, doctor, category, conclusion, notes, next_visit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertParam = db.prepare(`
    INSERT OR IGNORE INTO test_parameters (id, test_id, name, value, value_text, unit, ref_min, ref_max, is_abnormal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let usersInserted = 0;
  let membersInserted = 0;
  let testsInserted = 0;
  let paramsInserted = 0;

  for (const u of users) {
    insertUser.run(
      u.id,
      u.email,
      u.password,
      u.name,
      u.sex || null,
      u.birthDate || null,
      u.createdAt || new Date().toISOString()
    );
    usersInserted++;

    // Migrate family members embedded in user
    for (const m of u.members || []) {
      insertMember.run(
        m.id,
        u.id,
        m.name,
        m.sex || null,
        m.birthDate || null,
        m.relation || 'other',
        m.createdAt || new Date().toISOString()
      );
      membersInserted++;
    }
  }

  for (const t of tests) {
    const now = new Date().toISOString();
    insertTest.run(
      t.id,
      t.userId,
      t.memberId || null,
      t.date,
      t.lab || t.labName || null,
      t.doctor || null,
      t.category || 'other',
      t.conclusion || null,
      t.notes || null,
      t.nextVisit || null,
      t.createdAt || now,
      t.updatedAt || t.createdAt || now
    );
    testsInserted++;

    for (const p of t.parameters || []) {
      const val = parseFloat(p.value);
      const refMin = parseFloat(p.refLow ?? p.refMin ?? p.ref_min);
      const refMax = parseFloat(p.refHigh ?? p.refMax ?? p.ref_max);
      const isAbnormal = (!isNaN(val) && !isNaN(refMin) && val < refMin) ||
                         (!isNaN(val) && !isNaN(refMax) && val > refMax) ? 1 : 0;

      insertParam.run(
        newId(),
        t.id,
        p.name,
        isNaN(val) ? null : val,
        isNaN(val) ? String(p.value || '') : null,
        p.unit || null,
        isNaN(refMin) ? null : refMin,
        isNaN(refMax) ? null : refMax,
        isAbnormal
      );
      paramsInserted++;
    }
  }

  return { usersInserted, membersInserted, testsInserted, paramsInserted };
});

try {
  backup();
  const result = migrate();
  console.log(`✓ Migration complete:`);
  console.log(`  Users:      ${result.usersInserted}`);
  console.log(`  Members:    ${result.membersInserted}`);
  console.log(`  Tests:      ${result.testsInserted}`);
  console.log(`  Parameters: ${result.paramsInserted}`);

  // Verify
  const dbUsers  = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const dbTests  = db.prepare('SELECT COUNT(*) as n FROM tests').get().n;
  const dbParams = db.prepare('SELECT COUNT(*) as n FROM test_parameters').get().n;
  console.log(`\n✓ SQLite verification:`);
  console.log(`  Users: ${dbUsers}, Tests: ${dbTests}, Parameters: ${dbParams}`);
} catch (e) {
  console.error('✗ Migration failed:', e.message);
  process.exit(1);
}
