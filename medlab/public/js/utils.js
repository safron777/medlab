// ══════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════

export const escapeHTML = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Alias used in print report templates (no quote escaping needed there)
export function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span> ${msg}`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

export function slugify(str) {
  return str.toLowerCase().replace(/[^a-zа-я0-9]/gi, '-').replace(/-+/g, '-');
}

export function calcAge(birthDate) {
  return Math.floor((Date.now() - new Date(birthDate)) / (365.25 * 24 * 3600 * 1000));
}

export function openHtmlInNewTab(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
