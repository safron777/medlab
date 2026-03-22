// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
import { tests, currentUser } from './state.js';
import { escapeHTML, toast, formatDate, calcAge, todayStr } from './utils.js';
import {
  CATEGORIES, getPersonalizedRefs, getTestStatus,
  computeCalculatedIndicators,
} from './constants.js';

// Imported lazily to avoid circular dep (tests.js ↔ dashboard.js)
async function getRenderTestCard() {
  const { renderTestCard } = await import('./tests.js');
  return renderTestCard;
}

export function renderDashboard() {
  const now       = new Date();
  const thisMonth = tests.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const outCount = tests.filter(t => getTestStatus(t) !== 'normal').length;
  const okCount  = tests.filter(t => getTestStatus(t) === 'normal').length;
  document.getElementById('stat-total').textContent = tests.length;
  document.getElementById('stat-out').textContent   = outCount;
  document.getElementById('stat-month').textContent = thisMonth.length;
  document.getElementById('stat-ok').textContent    = okCount;

  renderNotifBanner();
  renderYearlySummary();
  renderCalculatedIndicators();
  renderUpcomingVisits();

  const recent    = tests.slice(0, 3);
  const container = document.getElementById('recent-tests');
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧪</div><div class="empty-title">Пока нет анализов</div><p>Добавьте первый анализ, чтобы начать отслеживать показатели</p><button class="btn btn-primary mt-3" onclick="openAddTest()">Добавить анализ</button></div>`;
    return;
  }
  // renderTestCard is imported async to break circular dep
  import('./tests.js').then(({ renderTestCard }) => {
    container.innerHTML = recent.map(renderTestCard).join('');
  });
}

export function renderUpcomingVisits() {
  const el = document.getElementById('upcoming-visits');
  if (!el) return;
  const today    = todayStr();
  const upcoming = tests
    .filter(t => t.nextVisit && t.nextVisit >= today)
    .sort((a, b) => a.nextVisit.localeCompare(b.nextVisit))
    .slice(0, 3);
  if (!upcoming.length) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="section-header mb-2">
      <div class="section-title">Ближайшие визиты</div>
    </div>
    ${upcoming.map(t => {
      const daysLeft = Math.round((new Date(t.nextVisit) - new Date(today)) / 86400000);
      const urgent   = daysLeft <= 7;
      return `<div class="visit-card" onclick="showTestDetail('${escapeHTML(t.id)}')">
        <div class="visit-card-icon">📅</div>
        <div>
          <div class="visit-card-title">${escapeHTML(t.name)}</div>
          <div class="visit-card-sub">${escapeHTML(formatDate(t.nextVisit))}${t.doctor ? ' · ' + escapeHTML(t.doctor) : ''}</div>
        </div>
        <div class="visit-days-badge ${urgent ? 'urgent' : ''}">${daysLeft === 0 ? 'Сегодня' : `через ${daysLeft}д`}</div>
      </div>`;
    }).join('')}`;
}

export function renderYearlySummary() {
  const el = document.getElementById('yearly-summary');
  if (!el) return;
  const year      = new Date().getFullYear();
  const yearTests = tests.filter(t => t.date && t.date.startsWith(String(year)));
  if (yearTests.length < 3) { el.innerHTML = ''; return; }

  const catCount = {};
  yearTests.forEach(t => { catCount[t.category] = (catCount[t.category] || 0) + 1; });
  const maxCat  = Math.max(...Object.values(catCount));
  const catBars = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([cat, cnt]) => {
      const label = CATEGORIES[cat]?.label || cat;
      const pct   = Math.round((cnt / maxCat) * 100);
      return `<div class="summary-bar-row">
        <div class="summary-bar-label">${label}</div>
        <div class="summary-bar-track"><div class="summary-bar-fill" style="width:${pct}%"></div></div>
        <div class="summary-bar-count">${cnt}</div>
      </div>`;
    }).join('');

  const abnormalCount = {};
  yearTests.forEach(t => {
    (t.parameters || []).forEach(p => {
      const val = parseFloat(p.value);
      let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
      let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
      if (refHigh === null && refLow === null) { const refs = getPersonalizedRefs(p.name); if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; } }
      const isAbnormal = (refHigh !== null && !isNaN(refHigh) && val > refHigh) ||
                         (refLow  !== null && !isNaN(refLow)  && refLow > 0 && val < refLow);
      if (isAbnormal) abnormalCount[p.name] = (abnormalCount[p.name] || 0) + 1;
    });
  });
  const topAbnormal = Object.entries(abnormalCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const abnormalTags = topAbnormal.map(([name, cnt]) =>
    `<span class="summary-tag bad">${name} (${cnt}×)</span>`).join('');

  const paramHistory = {};
  yearTests.slice().reverse().forEach(t => {
    (t.parameters || []).forEach(p => {
      if (!paramHistory[p.name]) paramHistory[p.name] = [];
      paramHistory[p.name].push({ value: parseFloat(p.value), date: t.date,
        refHigh: parseFloat(p.refHigh) || null, refLow: parseFloat(p.refLow) || null });
    });
  });
  const improved = [], worsened = [];
  Object.entries(paramHistory).forEach(([name, pts]) => {
    if (pts.length < 2) return;
    const first = pts[0], last = pts[pts.length - 1];
    let rh = first.refHigh, rl = first.refLow;
    if (!rh && !rl) { const refs = getPersonalizedRefs(name); if (refs) { rh = refs.refHigh; rl = refs.refLow; } }
    if (!rh && !rl) return;
    const mid      = rh && rl ? (rh + rl) / 2 : rh || rl;
    const distFirst = Math.abs(first.value - mid);
    const distLast  = Math.abs(last.value  - mid);
    if (distLast < distFirst * 0.85) improved.push(name);
    else if (distLast > distFirst * 1.15) worsened.push(name);
  });

  const outCount = yearTests.filter(t => getTestStatus(t) !== 'normal').length;
  const normPct  = Math.round(((yearTests.length - outCount) / yearTests.length) * 100);

  el.innerHTML = `
    <div class="summary-card">
      <div class="summary-title">📊 ${year} — итоги года</div>
      <div class="summary-big-grid">
        <div><div class="summary-big-num">${yearTests.length}</div><div class="summary-big-label">анализов</div></div>
        <div><div class="summary-big-num" style="color:var(--green)">${normPct}%</div><div class="summary-big-label">в норме</div></div>
        <div><div class="summary-big-num" style="color:var(--amber)">${outCount}</div><div class="summary-big-label">с отклонением</div></div>
      </div>
      ${catBars}
      ${abnormalTags ? `<div style="font-size:11px;color:var(--text-3);margin-top:14px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Частые отклонения</div><div class="summary-tags">${abnormalTags}</div>` : ''}
      ${improved.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:10px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Улучшились</div><div class="summary-tags">${improved.slice(0,4).map(n=>`<span class="summary-tag good">↑ ${escapeHTML(n)}</span>`).join('')}</div>` : ''}
      ${worsened.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:10px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Требуют внимания</div><div class="summary-tags">${worsened.slice(0,4).map(n=>`<span class="summary-tag bad">↓ ${escapeHTML(n)}</span>`).join('')}</div>` : ''}
    </div>`;
}

export function renderCalculatedIndicators() {
  const el = document.getElementById('calc-indicators');
  if (!el) return;
  const items = computeCalculatedIndicators();
  if (!items.length) { el.innerHTML = ''; return; }
  const STATUS_COLORS = { normal: 'var(--green)', mild: 'var(--blue)', moderate: 'var(--amber)', danger: 'var(--red)' };
  el.innerHTML = `
    <div class="section-header mb-2" style="margin-top:8px">
      <div class="section-title">Расчётные показатели</div>
    </div>
    <div class="calc-grid">
      ${items.map(i => `
        <div class="calc-card" style="--calc-accent:${STATUS_COLORS[i.status]}">
          <div class="calc-card-name">${i.name}</div>
          <div class="calc-card-value" style="color:${STATUS_COLORS[i.status]}">${i.value}</div>
          <div class="calc-card-unit">${i.unit}</div>
          <div class="calc-card-label" style="color:${STATUS_COLORS[i.status]}">${i.label}</div>
          <div class="calc-card-date">${formatDate(i.date)}</div>
        </div>`).join('')}
    </div>`;
}

// ── Notifications ──────────────────────────────────────────────────────────
export function updateNotifStatusLabel() {
  const el = document.getElementById('notif-status-label');
  if (!el) return;
  if (!('Notification' in window)) { el.textContent = 'Не поддерживается браузером'; return; }
  const labels = { granted: 'Включены ✓', denied: 'Заблокированы (изменить в настройках браузера)', default: 'Нажмите, чтобы включить' };
  el.textContent = labels[Notification.permission] || 'Неизвестно';
}

export async function toggleNotifications() {
  if (!('Notification' in window)) { toast('Браузер не поддерживает уведомления', 'error'); return; }
  if (Notification.permission === 'denied') { toast('Уведомления заблокированы — разрешите в настройках браузера', 'error'); return; }
  if (Notification.permission === 'granted') { toast('Уведомления уже включены', 'success'); return; }
  const result = await Notification.requestPermission();
  updateNotifStatusLabel();
  renderNotifBanner();
  if (result === 'granted') {
    toast('Уведомления включены ✓', 'success');
    checkAndSendReminders();
  } else {
    toast('Уведомления не разрешены', 'error');
  }
}

export function renderNotifBanner() {
  const el = document.getElementById('notif-banner');
  if (!el) return;
  if (!('Notification' in window) || Notification.permission !== 'default') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="notif-banner">
    <span style="font-size:20px">🔔</span>
    <span>Включите уведомления, чтобы получать напоминания о визитах к врачу</span>
    <button class="btn btn-primary btn-sm" onclick="toggleNotifications()">Включить</button>
  </div>`;
}

export async function checkAndSendReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today    = todayStr();
  const sw       = await navigator.serviceWorker?.ready.catch(() => null);
  const todayKey = `medlab_notif_${today}`;
  const sent     = JSON.parse(localStorage.getItem(todayKey) || '[]');

  for (const t of tests) {
    if (!t.nextVisit) continue;
    const daysLeft = Math.round((new Date(t.nextVisit) - new Date(today)) / 86400000);
    if (daysLeft < 0 || daysLeft > 7) continue;
    if (sent.includes(t.id)) continue;
    const title = daysLeft === 0 ? 'MedLab — Визит сегодня!' : `MedLab — Визит через ${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}`;
    const body  = `${t.name}${t.doctor ? ' · ' + t.doctor : ''} — ${formatDate(t.nextVisit)}`;
    const opts  = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: `visit-${t.id}`, renotify: daysLeft === 0 };
    if (sw) { await sw.showNotification(title, opts); } else { new Notification(title, opts); }
    sent.push(t.id);
  }
  localStorage.setItem(todayKey, JSON.stringify(sent));
}
