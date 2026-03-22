const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'medlab.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Run migrations
const runMigrations = () => {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))`);
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (!applied.has(file)) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      console.log(`Migration applied: ${file}`);
    }
  }
};

runMigrations();

// Cleanup expired JWT blacklist entries (run once on startup)
db.prepare(`DELETE FROM jwt_blacklist WHERE expires_at < datetime('now')`).run();

const newId = () => crypto.randomUUID();

module.exports = { db, newId };
