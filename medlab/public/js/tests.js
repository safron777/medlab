// ══════════════════════════════════════════════════════
// TESTS — CRUD & RENDERING
// ══════════════════════════════════════════════════════
import {
  tests, setTests, currentCategory, currentMemberId,
  currentPage, setCurrentPage, totalPages, setTotalPages,
  searchDebounceTimer, setSearchDebounceTimer,
  editingTestId, setEditingTestId,
  paramRowCount, setParamRowCount,
  currentAttachments, setCurrentAttachments,
} from './state.js';
import { apiFetch } from './api.js';
import { escapeHTML, toast, formatDate, slugify, todayStr, openHtmlInNewTab, esc, calcAge } from './utils.js';
import {
  CATEGORIES, getPersonalizedRefs, renderTrend, getTestStatus,
  computeCalculatedIndicators,
} from './constants.js';
import { renderDashboard } from './dashboard.js';
import { renderCharts } from './charts.js';
import { openOverlay, closeOverlay } from './navigation.js';

export async function loadTests(page = 1) {
  try {
    const search = document.getElementById('search-input')?.value.trim() || '';
    const params = new URLSearchParams({ page, limit: 50 });
    if (currentMemberId) params.set('memberId', currentMemberId);
    if (currentCategory !== 'all') params.set('category', currentCategory);
    if (search) params.set('search', search);
    const data = await apiFetch(`/api/tests?${params}`);
    setTests(data.tests);
    setCurrentPage(data.page);
    setTotalPages(data.pages);
    renderDashboard();
    renderTestList();
    renderCharts();
    const { checkAndSendReminders } = await import('./dashboard.js');
    checkAndSendReminders();
  } catch {
    toast('Ошибка загрузки данных', 'error');
  }
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function drawSparkline(paramName) {
  const points = [];
  for (const t of tests) {
    const p = (t.parameters || []).find(pr => pr.name === paramName);
    if (p) {
      const v = parseFloat(p.value);
      if (!isNaN(v)) points.push({ date: t.date, value: v });
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) return '';

  const W = 48, H = 16, PAD = 2;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const n = points.length;
  const xs = points.map((_, i) => PAD + (i / (n - 1)) * (W - 2 * PAD));
  const ys = points.map(p => PAD + (1 - (p.value - min) / range) * (H - 2 * PAD));
  const polyline = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const lx = xs[n - 1].toFixed(1), ly = ys[n - 1].toFixed(1);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="vertical-align:middle;margin-left:4px;opacity:0.65;flex-shrink:0"><polyline points="${polyline}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx}" cy="${ly}" r="2" fill="currentColor"/></svg>`;
}

// ── Rendering ──────────────────────────────────────────────────────────────
export function renderTestCard(test) {
  const status    = getTestStatus(test);
  const cat       = CATEGORIES[test.category] || CATEGORIES.other;
  const badgeClass = { danger: 'badge-danger', moderate: 'badge-warning', mild: 'badge-mild', normal: 'badge-normal' }[status] || 'badge-normal';
  const badgeText  = { danger: '⚠ Значительное', moderate: '↕ Умеренное', mild: '~ Незначительное', normal: '✓ Норма' }[status] || '✓ Норма';
  const params    = (test.parameters || []).slice(0, 4);
  const paramPills = params.map(p => {
    const val = parseFloat(p.value);
    let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
    let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
    if (refHigh === null && refLow === null) {
      const refs = getPersonalizedRefs(p.name);
      if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; }
    }
    let cls = '', dot = 'dot-ok';
    if (refHigh !== null && !isNaN(refHigh) && val > refHigh)        { cls = 'out-high'; dot = 'dot-high'; }
    else if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow) { cls = 'out-low'; dot = 'dot-low'; }
    const trend = renderTrend(p.name, p.value, test.date);
    const spark = drawSparkline(p.name);
    return `<div class="param-pill ${cls}"><span class="dot ${dot}"></span>${escapeHTML(p.name)}: <span class="val">${escapeHTML(String(p.value))}</span> <span class="text-muted">${escapeHTML(p.unit)}</span>${trend}${spark}</div>`;
  }).join('');
  const doctorLine = test.doctor ? `<span style="color:var(--teal);font-size:11px">👨‍⚕️ ${escapeHTML(test.doctor)}</span>` : '';
  return `<div class="test-card" onclick="showTestDetail('${escapeHTML(test.id)}')">
    <div class="test-card-header">
      <div>
        <div class="test-card-title">${cat.icon} ${escapeHTML(test.name)}</div>
        <div class="test-card-date">${escapeHTML(formatDate(test.date))}${test.lab ? ' · ' + escapeHTML(test.lab) : ''}${doctorLine ? '  ' + doctorLine : ''}</div>
      </div>
      <span class="test-badge ${badgeClass}">${badgeText}</span>
    </div>
    ${paramPills ? `<div class="param-pills">${paramPills}</div>` : ''}
  </div>`;
}

export function renderTestList() {
  const container = document.getElementById('all-tests');
  if (!tests.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><p>Попробуйте изменить фильтр или добавьте новый анализ</p></div>`;
  } else {
    container.innerHTML = tests.map(renderTestCard).join('');
  }
  renderPagination();
}

export function renderPagination() {
  let el = document.getElementById('tests-pagination');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tests-pagination';
    el.style.cssText = 'display:flex;justify-content:center;gap:8px;margin-top:16px;align-items:center';
    document.getElementById('all-tests')?.after(el);
  }
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="loadTests(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>← Назад</button>
    <span style="font-size:13px;color:var(--text-2)">${currentPage} / ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" onclick="loadTests(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Вперёд →</button>
  `;
}

export function filterTests() {
  clearTimeout(searchDebounceTimer);
  setSearchDebounceTimer(setTimeout(() => loadTests(1), 300));
}

export function selectCategory(el, cat) {
  document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  import('./state.js').then(({ setCurrentCategory }) => { setCurrentCategory(cat); loadTests(1); });
}

// ── Test detail ────────────────────────────────────────────────────────────
export function showTestDetail(id) {
  const test = tests.find(t => t.id === id);
  if (!test) return;
  const cat    = CATEGORIES[test.category] || CATEGORIES.other;
  const status = getTestStatus(test);
  const statusText = { normal: '✓ Все в норме', mild: '~ Незначительные отклонения', moderate: '↕ Умеренные отклонения', danger: '⚠ Значительные отклонения' }[status] || '✓ Все в норме';
  const badgeClass = { normal: 'badge-normal', mild: 'badge-mild', moderate: 'badge-warning', danger: 'badge-danger' }[status] || 'badge-normal';

  const paramsHTML = (test.parameters || []).map(p => {
    const val = parseFloat(p.value);
    let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
    let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
    let refSource = 'stored';
    if (refHigh === null && refLow === null) {
      const refs = getPersonalizedRefs(p.name);
      if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; refSource = 'personal'; }
    }
    let statusChip = '<span class="status-chip" style="background:rgba(16,185,129,0.1);color:var(--green)">✓ Норма</span>';
    let valColor = 'var(--text-1)';
    if (refHigh !== null && !isNaN(refHigh) && val > refHigh) {
      statusChip = '<span class="status-chip" style="background:rgba(239,68,68,0.1);color:var(--red)">↑ Выше нормы</span>';
      valColor = 'var(--red)';
    } else if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow) {
      statusChip = '<span class="status-chip" style="background:rgba(245,158,11,0.1);color:var(--amber)">↓ Ниже нормы</span>';
      valColor = 'var(--amber)';
    }
    const refStr     = (refLow !== null && refHigh !== null) ? `${refLow} – ${refHigh}` : (refHigh !== null ? `< ${refHigh}` : '—');
    const personalTag = refSource === 'personal' ? `<span style="font-size:9px;color:var(--teal);margin-left:4px" title="Персональная норма">★</span>` : '';
    const trend       = renderTrend(p.name, p.value, test.date);
    return `<tr>
      <td>${escapeHTML(p.name)}</td>
      <td class="param-val" style="color:${valColor}">${escapeHTML(String(p.value ?? ''))}${trend} <span class="text-muted text-xs">${escapeHTML(p.unit)}</span></td>
      <td class="ref-range">${escapeHTML(refStr)}${personalTag} <span class="text-muted">${escapeHTML(p.unit)}</span></td>
      <td>${statusChip}</td>
    </tr>`;
  }).join('');

  document.getElementById('detail-content').innerHTML = `
    <div class="flex gap-2" style="align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700">${cat.icon} ${escapeHTML(test.name)}</div>
        <div class="text-muted text-sm mt-1">${escapeHTML(formatDate(test.date))}${test.lab ? ' · ' + escapeHTML(test.lab) : ''}</div>
      </div>
      <span class="test-badge ${badgeClass}">${statusText}</span>
    </div>

    ${test.parameters?.length ? `<div class="detail-section">
      <div class="detail-section-title">Показатели</div>
      <div style="overflow-x:auto">
        <table class="param-table">
          <thead><tr><th>Показатель</th><th>Значение</th><th>Референс</th><th>Статус</th></tr></thead>
          <tbody>${paramsHTML}</tbody>
        </table>
      </div>
    </div>` : ''}

    ${(test.doctor || test.nextVisit) ? `<div class="detail-section">
      <div class="detail-section-title">Врач и визит</div>
      ${test.doctor ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><span style="font-size:18px">👨‍⚕️</span><div><div style="font-size:14px;font-weight:600">${escapeHTML(test.doctor)}</div><div class="text-xs text-muted">Назначивший врач</div></div></div>` : ''}
      ${test.nextVisit ? `<div style="display:flex;gap:8px;align-items:center"><span style="font-size:18px">📅</span><div><div style="font-size:14px;font-weight:600">${escapeHTML(formatDate(test.nextVisit))}</div><div class="text-xs text-muted">Следующий визит</div></div></div>` : ''}
    </div>` : ''}

    ${test.conclusion ? `<div class="detail-section">
      <div class="detail-section-title">Заключение врача</div>
      <div class="detail-conclusion">${escapeHTML(test.conclusion)}</div>
    </div>` : ''}

    ${test.notes ? `<div class="detail-section">
      <div class="detail-section-title">Примечания</div>
      <div class="detail-note">${escapeHTML(test.notes)}</div>
    </div>` : ''}

    ${test.attachments?.length ? `<div class="detail-section">
      <div class="detail-section-title">Вложения (${test.attachments.length})</div>
      ${test.attachments.map(a => renderAttachmentPreview({ name: a.name, type: a.type, dataUrl: a.data })).join('')}
    </div>` : ''}

    <div class="flex gap-2 mt-4">
      <button class="btn btn-ghost" style="flex:1" onclick="closeOverlay('detail-overlay')">Закрыть</button>
      <button class="btn btn-ghost btn-sm" onclick="printTestReport('${escapeHTML(test.id)}')" title="Экспорт в PDF">📄 PDF</button>
      <button class="btn btn-ghost" style="flex:1" onclick="editTest('${escapeHTML(test.id)}')">✏️ Редактировать</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTest('${escapeHTML(test.id)}')">🗑</button>
    </div>`;

  openOverlay('detail-overlay');
}

// ── Add / Edit ─────────────────────────────────────────────────────────────
export function openAddTest() {
  setEditingTestId(null);
  document.getElementById('drawer-title').textContent = 'Новый анализ';
  document.getElementById('test-name').value = '';
  document.getElementById('test-date').value = todayStr();
  document.getElementById('test-lab').value = '';
  document.getElementById('test-doctor').value = '';
  document.getElementById('test-next-visit').value = '';
  document.getElementById('test-conclusion').value = '';
  document.getElementById('test-notes').value = '';
  document.getElementById('test-category').value = 'blood';
  document.getElementById('params-list').innerHTML = '';
  setCurrentAttachments([]);
  renderAttachmentsList();
  document.getElementById('test-attachment').value = '';
  setParamRowCount(0);
  addParamRow();
  openOverlay('add-test-overlay');
}

export function editTest(id) {
  closeOverlay('detail-overlay');
  const test = tests.find(t => t.id === id);
  if (!test) return;
  setEditingTestId(id);
  document.getElementById('drawer-title').textContent = 'Редактировать анализ';
  document.getElementById('test-name').value       = test.name;
  document.getElementById('test-date').value       = test.date;
  document.getElementById('test-lab').value        = test.lab || '';
  document.getElementById('test-doctor').value     = test.doctor || '';
  document.getElementById('test-next-visit').value = test.nextVisit || '';
  document.getElementById('test-conclusion').value = test.conclusion || '';
  document.getElementById('test-notes').value      = test.notes || '';
  document.getElementById('test-category').value   = test.category;
  document.getElementById('params-list').innerHTML = '';
  document.getElementById('test-attachment').value = '';
  setCurrentAttachments((test.attachments || []).map(a => ({ name: a.name, type: a.type, size: a.size, dataUrl: a.data })));
  renderAttachmentsList();
  setParamRowCount(0);
  if (test.parameters?.length) { test.parameters.forEach(p => addParamRow(p)); } else { addParamRow(); }
  openOverlay('add-test-overlay');
}

export function addParamRow(data = {}) {
  const i   = paramRowCount;
  setParamRowCount(paramRowCount + 1);
  const row = document.createElement('div');
  row.className = 'param-form-row';
  row.id        = `param-row-${i}`;
  row.innerHTML = `
    <input type="text"   class="form-input" placeholder="Показатель" value="${escapeHTML(data.name || '')}" id="p-name-${i}">
    <input type="number" class="form-input" placeholder="0.0" value="${escapeHTML(String(data.value ?? ''))}" id="p-val-${i}" step="any">
    <input type="text"   class="form-input" placeholder="г/л" value="${escapeHTML(data.unit || '')}" id="p-unit-${i}">
    <input type="text"   class="form-input" placeholder="0-100" value="${escapeHTML(String(data.refLow !== undefined ? data.refLow : ''))}–${escapeHTML(String(data.refHigh !== undefined ? data.refHigh : ''))}" id="p-ref-${i}" title="Норма: нижн–верхн, напр. 120–160">
    <button class="btn btn-ghost btn-icon" onclick="document.getElementById('param-row-${i}').remove()" title="Удалить">✕</button>`;
  document.getElementById('params-list').appendChild(row);
}

export function loadQuickParams(category) {
  import('./constants.js').then(({ COMMON_PARAMS }) => {
    const list = COMMON_PARAMS[category];
    if (!list) return;
    document.getElementById('params-list').innerHTML = '';
    setParamRowCount(0);
    list.forEach(p => addParamRow(p));
  });
}

export async function saveTest() {
  const name     = document.getElementById('test-name').value.trim();
  const date     = document.getElementById('test-date').value;
  const category = document.getElementById('test-category').value;
  if (!name) return toast('Укажите название анализа', 'error');
  if (!date) return toast('Укажите дату', 'error');

  const parameters = [];
  document.querySelectorAll('#params-list .param-form-row').forEach(row => {
    const id        = row.id.split('-').pop();
    const paramName = document.getElementById(`p-name-${id}`)?.value.trim();
    const val       = document.getElementById(`p-val-${id}`)?.value;
    const unit      = document.getElementById(`p-unit-${id}`)?.value.trim();
    const refRaw    = document.getElementById(`p-ref-${id}`)?.value || '';
    if (!paramName || !val) return;
    const refParts  = refRaw.split('–').map(s => s.trim());
    parameters.push({ name: paramName, value: val, unit, refLow: refParts[0] || '', refHigh: refParts[1] || '' });
  });

  const payload = {
    name,
    date,
    category,
    lab:        document.getElementById('test-lab').value.trim(),
    doctor:     document.getElementById('test-doctor').value.trim() || null,
    nextVisit:  document.getElementById('test-next-visit').value || null,
    conclusion: document.getElementById('test-conclusion').value.trim() || null,
    notes:      document.getElementById('test-notes').value.trim(),
    attachments: currentAttachments.map(a => ({ name: a.name, type: a.type, size: a.size, data: a.dataUrl })),
    memberId:   currentMemberId || undefined,
    parameters,
  };

  const btn = document.getElementById('save-test-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    if (editingTestId) {
      await apiFetch(`/api/tests/${editingTestId}`, 'PUT', payload);
      toast('Анализ обновлён ✓', 'success');
    } else {
      await apiFetch('/api/tests', 'POST', payload);
      toast('Анализ добавлён ✓', 'success');
    }
    closeOverlay('add-test-overlay');
    await loadTests(1);
  } catch (e) {
    toast(e.message || 'Ошибка сохранения', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

export async function deleteTest(id) {
  if (!confirm('Удалить этот анализ?')) return;
  try {
    await apiFetch(`/api/tests/${id}`, 'DELETE');
    closeOverlay('detail-overlay');
    await loadTests(1);
    toast('Анализ удалён', 'success');
  } catch {
    toast('Ошибка удаления', 'error');
  }
}

// ── Attachment helpers ──────────────────────────────────────────────────────
export function handleAttachmentChange(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toast('Файл слишком большой (макс. 10 МБ)', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    setCurrentAttachments([...currentAttachments, { name: file.name, type: file.type, size: file.size, dataUrl: e.target.result }]);
    input.value = '';
    renderAttachmentsList();
  };
  reader.readAsDataURL(file);
}

export function removeAttachment(index) {
  setCurrentAttachments(currentAttachments.filter((_, i) => i !== index));
  renderAttachmentsList();
}

function renderAttachmentsList() {
  const container = document.getElementById('attachment-preview');
  const label = document.getElementById('attachment-zone-label');
  if (!currentAttachments.length) {
    container.innerHTML = '';
    label.textContent = '📎 Нажмите или перетащите файл (до 10 МБ)';
    return;
  }
  label.textContent = '📎 Добавить ещё файл';
  container.innerHTML = currentAttachments.map((a, i) => `
    <div class="attachment-file-badge">
      ${a.type?.startsWith('image/') ? `<img src="${a.dataUrl}" style="width:28px;height:28px;object-fit:cover;border-radius:3px;margin-right:6px;flex-shrink:0">` : '<span style="margin-right:6px">📄</span>'}
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">${escapeHTML(a.name)}</span>
      <a href="${a.dataUrl}" download="${escapeHTML(a.name)}" style="color:var(--teal);font-size:11px;margin:0 4px" title="Скачать">⬇</a>
      <button class="btn btn-ghost btn-icon btn-sm" onclick="removeAttachment(${i})" title="Удалить" style="padding:1px 5px;font-size:11px">✕</button>
    </div>`).join('');
}

export function renderAttachmentPreview(att) {
  if (!att) return '';
  if (att.type && att.type.startsWith('image/')) {
    return `<div class="attachment-preview"><img src="${att.dataUrl}" alt="${escapeHTML(att.name)}"></div>`;
  }
  return `<div class="attachment-file-badge">📄 <span>${escapeHTML(att.name)}</span><a href="${att.dataUrl}" download="${escapeHTML(att.name)}" style="margin-left:auto;color:var(--teal);font-size:12px">Скачать</a></div>`;
}

// ── Print report ───────────────────────────────────────────────────────────
export function printTestReport(id) {
  import('./state.js').then(({ currentUser: cu }) => _printTestReport(id, cu));
}

function _printTestReport(id, cu) {
  const test = tests.find(t => t.id === id);
  if (!test) return;
  const cat = CATEGORIES[test.category] || CATEGORIES.other;

  const paramsRows = (test.parameters || []).map(p => {
    const val = parseFloat(p.value);
    let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
    let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
    if (refHigh === null && refLow === null) { const refs = getPersonalizedRefs(p.name); if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; } }
    let stText = 'Норма', stColor = '#10B981';
    if (refHigh !== null && !isNaN(refHigh) && val > refHigh) { stText = '↑ Выше нормы'; stColor = '#EF4444'; }
    else if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow) { stText = '↓ Ниже нормы'; stColor = '#F59E0B'; }
    const refStr = (refLow !== null && refHigh !== null) ? `${refLow} – ${refHigh}` : refHigh !== null ? `< ${refHigh}` : '—';
    return `<tr><td>${esc(p.name)}</td><td style="font-weight:600;color:${stColor}">${esc(p.value)} ${esc(p.unit)}</td><td>${refStr} ${esc(p.unit)}</td><td style="color:${stColor}">${stText}</td></tr>`;
  }).join('');

  const patientLine = [
    cu?.name,
    cu?.birthDate ? calcAge(cu.birthDate) + ' лет' : null,
    cu?.sex === 'male' ? 'Мужской' : cu?.sex === 'female' ? 'Женский' : null,
  ].filter(Boolean).join(' · ');

  const calcItems = computeCalculatedIndicators();
  const calcRows  = calcItems.map(i =>
    `<tr><td>${esc(i.name)}</td><td>${esc(i.value)} ${esc(i.unit)}</td><td>${esc(i.label)}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<title>MedLab — ${esc(test.name)}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:36px auto;color:#1a1a2e;font-size:14px;line-height:1.6}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #00836e;padding-bottom:12px;margin-bottom:20px}
  .logo{font-size:22px;font-weight:700;color:#00836e}.logo span{color:#3B82F6}
  .meta{font-size:12px;color:#666;text-align:right}
  h2{font-size:13px;font-weight:700;color:#00836e;text-transform:uppercase;letter-spacing:.06em;margin:20px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th{background:#f0fdf9;padding:7px 10px;text-align:left;font-size:11px;color:#374151;border:1px solid #d1fae5}
  td{padding:7px 10px;border:1px solid #e5e7eb;font-size:13px}
  .disclaimer{margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
  .test-title{font-size:20px;font-weight:700;margin-bottom:4px}
  .test-meta{font-size:13px;color:#6b7280;margin-bottom:4px}
  .conclusion{background:#eff6ff;border-left:3px solid #3B82F6;padding:10px 14px;border-radius:4px;font-size:13px;margin:4px 0}
  .notes{background:#f9fafb;border-left:3px solid #e5e7eb;padding:10px 14px;border-radius:4px;font-size:13px}
  @media print{.no-print{display:none}}
</style></head><body>
<div class="header">
  <div><div class="logo">Med<span>Lab</span></div><div style="font-size:11px;color:#6b7280;margin-top:2px">Личный учёт анализов</div></div>
  <div class="meta">Сформировано: ${new Date().toLocaleDateString('ru-RU')}<br>${patientLine}</div>
</div>
<div class="test-title">${cat.icon} ${esc(test.name)}</div>
<div class="test-meta">Дата: ${formatDate(test.date)}${test.lab ? ' &nbsp;·&nbsp; ' + esc(test.lab) : ''}${test.doctor ? ' &nbsp;·&nbsp; Врач: ' + esc(test.doctor) : ''}</div>
${test.nextVisit ? `<div class="test-meta">Следующий визит: ${formatDate(test.nextVisit)}</div>` : ''}
${paramsRows ? `<h2>Показатели</h2><table><thead><tr><th>Показатель</th><th>Значение</th><th>Референс</th><th>Статус</th></tr></thead><tbody>${paramsRows}</tbody></table>` : ''}
${calcRows ? `<h2>Расчётные показатели</h2><table><thead><tr><th>Показатель</th><th>Значение</th><th>Интерпретация</th></tr></thead><tbody>${calcRows}</tbody></table>` : ''}
${test.conclusion ? `<h2>Заключение врача</h2><div class="conclusion">${esc(test.conclusion)}</div>` : ''}
${test.notes ? `<h2>Примечания</h2><div class="notes">${esc(test.notes)}</div>` : ''}
<div class="disclaimer">Документ сформирован приложением MedLab для личного учёта. Не является официальным медицинским документом. Интерпретацию результатов осуществляет лечащий врач.</div>
<div class="no-print" style="margin-top:24px">
  <button onclick="window.print()" style="padding:10px 24px;background:#00836e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">🖨 Печать / Сохранить PDF</button>
</div>
</body></html>`;
  openHtmlInNewTab(html);
}

export function printFullReport() {
  import('./state.js').then(({ currentUser: cu }) => _printFullReport(cu));
}

function _printFullReport(cu) {
  if (!tests.length) { toast('Нет анализов для отчёта', 'error'); return; }

  const patientLine = [
    cu?.name,
    cu?.birthDate ? calcAge(cu.birthDate) + ' лет' : null,
    cu?.sex === 'male' ? 'Мужской' : cu?.sex === 'female' ? 'Женский' : null,
  ].filter(Boolean).join(' · ');

  const calcItems = computeCalculatedIndicators();
  const calcRows  = calcItems.map(i =>
    `<tr><td>${esc(i.name)}</td><td>${esc(i.value)} ${esc(i.unit)}</td><td>${esc(i.label)}</td><td>${formatDate(i.date)}</td></tr>`
  ).join('');

  const testsHTML = tests.map(test => {
    const cat         = CATEGORIES[test.category] || CATEGORIES.other;
    const status      = getTestStatus(test);
    const statusLabel = { normal: '✓ Норма', mild: '~ Незначительное', moderate: '↕ Умеренное', danger: '⚠ Значительное' }[status];
    const rows        = (test.parameters || []).map(p => {
      const val = parseFloat(p.value);
      let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
      let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
      if (refHigh === null && refLow === null) { const refs = getPersonalizedRefs(p.name); if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; } }
      let stText = 'Норма', stColor = '#10B981';
      if (refHigh !== null && !isNaN(refHigh) && val > refHigh) { stText = '↑'; stColor = '#EF4444'; }
      else if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow) { stText = '↓'; stColor = '#F59E0B'; }
      const refStr = (refLow !== null && refHigh !== null) ? `${refLow}–${refHigh}` : refHigh !== null ? `<${refHigh}` : '—';
      return `<tr><td>${esc(p.name)}</td><td style="color:${stColor}">${esc(p.value)} ${esc(p.unit)}</td><td>${refStr}</td><td style="color:${stColor}">${stText}</td></tr>`;
    }).join('');
    return `<div style="margin-bottom:24px;page-break-inside:avoid">
      <div style="font-weight:700;font-size:15px">${cat.icon} ${esc(test.name)} <span style="font-size:11px;color:#6b7280;font-weight:400">${formatDate(test.date)}${test.lab ? ' · ' + esc(test.lab) : ''}</span> <span style="font-size:11px;font-weight:600">${statusLabel}</span></div>
      ${rows ? `<table style="width:100%;border-collapse:collapse;margin-top:6px"><thead><tr style="background:#f9fafb"><th style="padding:5px 8px;text-align:left;font-size:11px;border:1px solid #e5e7eb">Показатель</th><th style="padding:5px 8px;text-align:left;font-size:11px;border:1px solid #e5e7eb">Значение</th><th style="padding:5px 8px;text-align:left;font-size:11px;border:1px solid #e5e7eb">Норма</th><th style="padding:5px 8px;font-size:11px;border:1px solid #e5e7eb">Ст.</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>MedLab — Полный отчёт</title>
<style>body{font-family:Arial,sans-serif;max-width:760px;margin:36px auto;color:#1a1a2e;font-size:13px}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #00836e;padding-bottom:12px;margin-bottom:20px}
.logo{font-size:20px;font-weight:700;color:#00836e}h2{font-size:13px;font-weight:700;color:#00836e;text-transform:uppercase;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin:20px 0 8px}
td,th{padding:5px 8px;border:1px solid #e5e7eb;font-size:12px}.disclaimer{margin-top:32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px}
@media print{.no-print{display:none}}</style></head><body>
<div class="header"><div><div class="logo">MedLab</div></div><div style="font-size:12px;color:#6b7280;text-align:right">Полный отчёт<br>${patientLine}<br>${new Date().toLocaleDateString('ru-RU')}</div></div>
${calcRows ? `<h2>Расчётные показатели</h2><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f0fdf9"><th>Показатель</th><th>Значение</th><th>Интерпретация</th><th>Дата данных</th></tr></thead><tbody>${calcRows}</tbody></table>` : ''}
<h2>Все анализы (${tests.length})</h2>${testsHTML}
<div class="disclaimer">Сформировано MedLab. Не является официальным медицинским документом.</div>
<div class="no-print" style="margin-top:20px"><button onclick="window.print()" style="padding:10px 24px;background:#00836e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">🖨 Печать / Сохранить PDF</button></div>
</body></html>`;
  openHtmlInNewTab(html);
}

