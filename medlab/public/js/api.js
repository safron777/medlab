// ══════════════════════════════════════════════════════
// API HELPERS & EXPORT / IMPORT
// ══════════════════════════════════════════════════════
import { token } from './state.js';
import { toast, todayStr } from './utils.js';

const API = ''; // Same origin

export async function apiFetch(url, method = 'GET', body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(API + url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка сети');
  return data;
}

export async function exportData() {
  try {
    const res = await fetch(API + '/api/export', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Ошибка сервера');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `medlab-backup-${todayStr()}.json`;
    a.click(); URL.revokeObjectURL(url);
    localStorage.setItem('medlab_last_backup', todayStr());
    renderBackupStatus();
    toast('Бэкап скачан ✓', 'success');
  } catch (err) {
    toast('Ошибка экспорта: ' + err.message, 'error');
  }
}

export async function exportCsv() {
  try {
    const res = await fetch(API + '/api/export/csv', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Ошибка сервера');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `medlab-${todayStr()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('CSV скачан ✓', 'success');
  } catch (err) {
    toast('Ошибка экспорта: ' + err.message, 'error');
  }
}

export function renderBackupStatus() {
  const el = document.getElementById('backup-status-sub');
  if (!el) return;
  const last = localStorage.getItem('medlab_last_backup');
  if (!last) { el.textContent = 'Бэкап никогда не создавался'; return; }
  const days = Math.round((new Date(todayStr()) - new Date(last)) / 86400000);
  el.textContent = days === 0 ? 'Последний бэкап: сегодня ✓' : `Последний бэкап: ${days} дн. назад${days > 30 ? ' ⚠' : ''}`;
}
