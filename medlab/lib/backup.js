'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BACKUP_DIR  = path.join(DATA_DIR, 'backups');
const DB_PATH     = path.join(DATA_DIR, 'medlab.db');
const KEEP_DAYS   = parseInt(process.env.BACKUP_KEEP_DAYS || '7');

function runBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.warn('[backup] DB file not found, skipping');
    return;
  }

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const dest  = path.join(BACKUP_DIR, `medlab-${stamp}.db`);

  fs.copyFileSync(DB_PATH, dest);
  console.log(`[backup] Created ${dest}`);

  // Rotate: delete backups older than KEEP_DAYS
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.startsWith('medlab-') || !f.endsWith('.db')) continue;
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log(`[backup] Removed old backup ${f}`);
    }
  }
}

module.exports = { runBackup };

// Allow direct invocation: node scripts/backup.js
if (require.main === module) runBackup();
