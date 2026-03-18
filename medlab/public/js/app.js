'use strict';
/* global Chart */

// ══════════════════════════════════════════════════════
// CONFIG & STATE
// ══════════════════════════════════════════════════════
const API = '';  // Same origin
let token = localStorage.getItem('medlab_token');
let currentUser = null;
let tests = [];
let currentCategory = 'all';
let editingTestId = null;
let paramRowCount = 0;
let currentAttachment = null;       // { name, type, dataUrl }
let members = [];                   // family members for current user
let currentMemberId = null;         // null = own profile
let editingMemberId = null;
const charts = {};

const CATEGORIES = {
  blood: { label: 'Кровь', icon: '🩸' },
  urine: { label: 'Моча', icon: '🔬' },
  biochem: { label: 'Биохимия', icon: '⚗️' },
  hormones: { label: 'Гормоны', icon: '🧬' },
  vitamins: { label: 'Витамины', icon: '💊' },
  other: { label: 'Прочее', icon: '📋' },
};

// Common blood test parameters (for quick-add)
const COMMON_PARAMS = {
  blood: [
    { name: 'Гемоглобин', unit: 'г/л', refLow: 120, refHigh: 160 },
    { name: 'Эритроциты', unit: '×10¹²/л', refLow: 3.8, refHigh: 5.1 },
    { name: 'Лейкоциты', unit: '×10⁹/л', refLow: 4.0, refHigh: 9.0 },
    { name: 'Тромбоциты', unit: '×10⁹/л', refLow: 150, refHigh: 400 },
    { name: 'СОЭ', unit: 'мм/ч', refLow: 2, refHigh: 15 },
    { name: 'Гематокрит', unit: '%', refLow: 36, refHigh: 48 },
  ],
  biochem: [
    { name: 'Глюкоза', unit: 'ммоль/л', refLow: 3.9, refHigh: 6.1 },
    { name: 'Холестерин общий', unit: 'ммоль/л', refLow: 0, refHigh: 5.2 },
    { name: 'АЛТ', unit: 'Ед/л', refLow: 0, refHigh: 40 },
    { name: 'АСТ', unit: 'Ед/л', refLow: 0, refHigh: 40 },
    { name: 'Билирубин общий', unit: 'мкмоль/л', refLow: 0, refHigh: 20.5 },
    { name: 'Мочевина', unit: 'ммоль/л', refLow: 2.5, refHigh: 8.3 },
    { name: 'Креатинин', unit: 'мкмоль/л', refLow: 44, refHigh: 115 },
  ],
  hormones: [
    { name: 'ТТГ', unit: 'мМЕ/л', refLow: 0.4, refHigh: 4.0 },
    { name: 'Т4 свободный', unit: 'пмоль/л', refLow: 9.0, refHigh: 22.0 },
    { name: 'Кортизол', unit: 'нмоль/л', refLow: 138, refHigh: 635 },
    { name: 'Инсулин', unit: 'мкЕд/мл', refLow: 2.0, refHigh: 25.0 },
  ],
  vitamins: [
    { name: 'Витамин D', unit: 'нг/мл', refLow: 30, refHigh: 100 },
    { name: 'Витамин B12', unit: 'пг/мл', refLow: 187, refHigh: 883 },
    { name: 'Железо', unit: 'мкмоль/л', refLow: 9.0, refHigh: 30.4 },
    { name: 'Ферритин', unit: 'нг/мл', refLow: 10, refHigh: 120 },
    { name: 'Фолиевая кислота', unit: 'нг/мл', refLow: 3.1, refHigh: 17.5 },
  ],
};

// ══════════════════════════════════════════════════════
// PERSONALIZED REFERENCE RANGES (sex/age-specific)
// Sources: clinical laboratory standards (ГОСТ Р, WHO)
// Format: [refLow, refHigh] or { male, female } or age function
// ══════════════════════════════════════════════════════
const SEX_AGE_REFS = {
  // Sex-specific
  'Гемоглобин':        { male: [130, 170],   female: [120, 150] },
  'Эритроциты':        { male: [4.0, 5.5],   female: [3.7, 4.7] },
  'Гематокрит':        { male: [40, 50],     female: [36, 44] },
  'Ферритин':          { male: [20, 300],    female: [10, 120] },
  'Железо':            { male: [11.0, 28.0], female: [9.0, 27.0] },
  'Креатинин':         { male: [62, 115],    female: [44, 97] },
  // Sex + age-specific
  'СОЭ': {
    male:   (age) => age < 50 ? [1, 15]  : [1, 20],
    female: (age) => age < 50 ? [2, 20]  : [2, 30],
  },
  'АЛТ': {
    male:   [7, 45],
    female: [7, 35],
  },
  'АСТ': {
    male:   [10, 40],
    female: [10, 35],
  },
  // Universal
  'Лейкоциты':         [4.0, 9.0],
  'Тромбоциты':        [150, 400],
  'Нейтрофилы':        [45, 70],
  'Лимфоциты':         [19, 37],
  'Моноциты':          [3, 11],
  'Эозинофилы':        [0, 5],
  'Базофилы':          [0, 1],
  'Глюкоза':           [3.9, 6.1],
  'Холестерин общий':  [0, 5.2],
  'ЛПНП':              [0, 3.0],
  'ЛПВП':              [1.0, 2.2],
  'Триглицериды':      [0, 1.7],
  'Билирубин общий':   [0, 20.5],
  'Билирубин прямой':  [0, 5.1],
  'Мочевина':          [2.5, 8.3],
  'Мочевая кислота':   [0.14, 0.36],
  'Общий белок':       [64, 83],
  'Альбумин':          [35, 52],
  'Глюкоза нат.':      [3.9, 6.1],
  'ТТГ':               [0.4, 4.0],
  'Т4 свободный':      [9.0, 22.0],
  'Т3 свободный':      [2.6, 5.7],
  'Кортизол':          [138, 635],
  'Инсулин':           [2.0, 25.0],
  'Витамин D':         [30, 100],
  'Витамин B12':       [187, 883],
  'Фолиевая кислота':  [3.1, 17.5],
  'МНО':               [0.85, 1.15],
  'АЧТВ':              [25, 40],
  'Фибриноген':        [2.0, 4.0],
  'СРБ':               [0, 5.0],
  'ПСА общий':         [0, 4.0],
};

// Returns { refLow, refHigh } for known param using user's sex/age, or null
function getPersonalizedRefs(paramName) {
  const entry = SEX_AGE_REFS[paramName];
  if (!entry) return null;

  if (Array.isArray(entry)) return { refLow: entry[0], refHigh: entry[1] };

  const sex = currentUser?.sex || 'male';
  const birthDate = currentUser?.birthDate;
  const age = birthDate
    ? Math.floor((Date.now() - new Date(birthDate)) / (365.25 * 24 * 3600 * 1000))
    : 35;

  const sexEntry = entry[sex] || entry['male'];
  if (!sexEntry) return null;

  const range = typeof sexEntry === 'function' ? sexEntry(age) : sexEntry;
  return { refLow: range[0], refHigh: range[1] };
}

// Returns previous value for a parameter (for trend arrows)
function getPrevValue(paramName, testDate) {
  // tests is sorted descending by date; find most recent test before testDate
  for (const t of tests) {
    if (t.date < testDate) {
      const p = (t.parameters || []).find(p => p.name === paramName);
      if (p) return parseFloat(p.value);
    }
  }
  return null;
}

// Returns HTML trend indicator vs previous measurement
function renderTrend(paramName, currentValue, testDate) {
  const prev = getPrevValue(paramName, testDate);
  if (prev === null || prev === 0) return '';
  const curr = parseFloat(currentValue);
  const diffPct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(diffPct) < 5) return `<span style="color:var(--text-3);font-size:9px;margin-left:3px">→</span>`;
  const dir = diffPct > 0 ? '↑' : '↓';
  return `<span style="color:var(--text-2);font-size:9px;margin-left:3px">${dir}${Math.abs(Math.round(diffPct))}%</span>`;
}

function calcAge(birthDate) {
  return Math.floor((Date.now() - new Date(birthDate)) / (365.25 * 24 * 3600 * 1000));
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  // Set today's date default for date inputs
  document.getElementById('test-date').value = todayStr();

  if (token) {
    try {
      const res = await apiFetch('/api/auth/me');
      currentUser = res;
      enterApp();
    } catch {
      token = null;
      localStorage.removeItem('medlab_token');
    }
  }
});

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register')));
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return toast('Заполните все поля', 'error');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Вход...';
  try {
    const data = await apiFetch('/api/auth/login', 'POST', { email, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('medlab_token', token);
    enterApp();
  } catch (e) {
    toast(e.message || 'Неверный логин или пароль', 'error');
    btn.disabled = false; btn.textContent = 'Войти';
  }
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const sex = document.getElementById('reg-sex').value || null;
  const birthDate = document.getElementById('reg-birthdate').value || null;
  if (!name || !email || !password) return toast('Заполните все поля', 'error');
  if (password.length < 6) return toast('Пароль минимум 6 символов', 'error');
  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await apiFetch('/api/auth/register', 'POST', { name, email, password, sex, birthDate });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('medlab_token', token);
    enterApp();
  } catch (e) {
    toast(e.message || 'Ошибка регистрации', 'error');
    btn.disabled = false; btn.textContent = 'Создать аккаунт';
  }
}

function logout() {
  token = null;
  currentUser = null;
  tests = [];
  localStorage.removeItem('medlab_token');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  // Set user info
  const initial = (currentUser.name || 'U')[0].toUpperCase();
  document.getElementById('user-avatar').textContent = initial;
  document.getElementById('profile-avatar').textContent = initial;
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
  updateProfileMetaSub();
  updateNotifStatusLabel();
  renderBackupStatus();
  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  document.getElementById('greeting-text').textContent = `${greet}, ${currentUser.name.split(' ')[0]}! 👋`;
  document.getElementById('greeting-date').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  checkDisclaimer();
  loadMembers().then(() => loadTests());
}

function updateProfileMetaSub() {
  const el = document.getElementById('profile-meta-sub');
  if (!el) return;
  const sexLabel = currentUser.sex === 'male' ? 'Мужской' : currentUser.sex === 'female' ? 'Женский' : null;
  const ageLabel = currentUser.birthDate ? calcAge(currentUser.birthDate) + ' лет' : null;
  const parts = [sexLabel, ageLabel].filter(Boolean);
  el.textContent = parts.length ? parts.join(' · ') : 'Пол и дата рождения не указаны';
}

function checkDisclaimer() {
  if (!localStorage.getItem('medlab_disclaimer_v1')) {
    document.getElementById('disclaimer-overlay').classList.add('open');
  }
}

function acceptDisclaimer() {
  localStorage.setItem('medlab_disclaimer_v1', '1');
  closeOverlay('disclaimer-overlay');
}

// ══════════════════════════════════════════════════════
// TESTS DATA
// ══════════════════════════════════════════════════════
async function loadTests() {
  try {
    const url = currentMemberId ? `/api/tests?memberId=${currentMemberId}` : '/api/tests';
    tests = await apiFetch(url);
    renderDashboard();
    renderTestList();
    renderCharts();
    checkAndSendReminders();
  } catch (e) {
    toast('Ошибка загрузки данных', 'error');
  }
}

// ══════════════════════════════════════════════════════
// FAMILY MEMBERS (6.2)
// ══════════════════════════════════════════════════════
const RELATIONS = { partner: 'Партнёр', child: 'Ребёнок', parent: 'Родитель', other: 'Другое' };
const RELATION_ICONS = { partner: '💑', child: '👶', parent: '👴', other: '👤' };

async function loadMembers() {
  try {
    members = await apiFetch('/api/members');
    renderMemberDropdown();
    renderMembersListProfile();
  } catch { members = []; }
}

function renderMemberDropdown() {
  const el = document.getElementById('member-dropdown');
  if (!el) return;
  const self = currentUser;
  const selfActive = currentMemberId === null;
  el.innerHTML = `
    <div class="member-option ${selfActive ? 'active' : ''}" onclick="switchMember(null)">
      <div class="member-option-avatar" style="background:linear-gradient(135deg,var(--teal),var(--blue))">${(self?.name||'Я')[0]}</div>
      <div><div style="font-size:13px;font-weight:${selfActive?'700':'500'}">${self?.name || 'Я'}</div><div style="font-size:11px;color:var(--text-3)">Мой профиль</div></div>
      ${selfActive ? '<span style="margin-left:auto;color:var(--teal);font-size:12px">✓</span>' : ''}
    </div>
    ${members.map(m => {
      const active = currentMemberId === m.id;
      return `<div class="member-option ${active ? 'active' : ''}" onclick="switchMember('${m.id}')">
        <div class="member-option-avatar">${m.name[0]}</div>
        <div><div style="font-size:13px;font-weight:${active?'700':'500'}">${m.name}</div><div style="font-size:11px;color:var(--text-3)">${RELATIONS[m.relation] || 'Другое'}${m.birthDate ? ' · ' + calcAge(m.birthDate) + ' лет' : ''}</div></div>
        ${active ? '<span style="margin-left:auto;color:var(--teal);font-size:12px">✓</span>' : ''}
      </div>`;
    }).join('')}
    <div class="member-option-footer" onclick="closeAllDropdowns();showPage('profile')">👨‍👩‍👧 Управление профилями</div>`;

  // Update topbar button label
  const btn = document.getElementById('member-switch-btn');
  const label = document.getElementById('member-current-label');
  if (label) {
    if (currentMemberId) {
      const m = members.find(x => x.id === currentMemberId);
      label.textContent = m ? m.name.split(' ')[0] : 'Профиль';
      btn?.classList.add('active-member');
    } else {
      label.textContent = 'Я';
      btn?.classList.remove('active-member');
    }
  }
}

function renderMembersListProfile() {
  const el = document.getElementById('members-list-profile');
  if (!el) return;
  if (!members.length) { el.innerHTML = ''; return; }
  el.innerHTML = members.map(m => `
    <div class="settings-item">
      <div class="settings-item-left">
        <div class="settings-item-icon" style="background:rgba(139,92,246,0.12);font-size:16px">${RELATION_ICONS[m.relation] || '👤'}</div>
        <div>
          <div class="settings-item-title">${m.name}</div>
          <div class="settings-item-sub">${RELATIONS[m.relation] || ''}${m.sex ? ' · ' + (m.sex==='male'?'М':'Ж') : ''}${m.birthDate ? ' · ' + calcAge(m.birthDate) + ' лет' : ''}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" onclick="openEditMember('${m.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function toggleMemberDropdown() {
  const el = document.getElementById('member-dropdown');
  if (!el) return;
  el.classList.toggle('hidden');
}

function closeAllDropdowns() {
  document.getElementById('member-dropdown')?.classList.add('hidden');
}

async function switchMember(memberId) {
  currentMemberId = memberId || null;
  closeAllDropdowns();
  renderMemberDropdown();
  // Update page titles
  const titleEl = document.getElementById('analyses-page-title');
  if (titleEl) {
    const m = members.find(x => x.id === currentMemberId);
    titleEl.textContent = currentMemberId ? `Анализы: ${m?.name || ''}` : 'Мои анализы';
  }
  await loadTests();
}

function openAddMember() {
  editingMemberId = null;
  document.getElementById('member-overlay-title').textContent = 'Добавить профиль';
  document.getElementById('member-name').value = '';
  document.getElementById('member-relation').value = 'partner';
  document.getElementById('member-sex').value = '';
  document.getElementById('member-birthdate').value = '';
  document.getElementById('save-member-btn').textContent = 'Добавить';
  openOverlay('member-edit-overlay');
}

function openEditMember(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  editingMemberId = id;
  document.getElementById('member-overlay-title').textContent = 'Редактировать профиль';
  document.getElementById('member-name').value = m.name;
  document.getElementById('member-relation').value = m.relation || 'other';
  document.getElementById('member-sex').value = m.sex || '';
  document.getElementById('member-birthdate').value = m.birthDate || '';
  document.getElementById('save-member-btn').textContent = 'Сохранить';
  openOverlay('member-edit-overlay');
}

async function saveMember() {
  const name     = document.getElementById('member-name').value.trim();
  const relation = document.getElementById('member-relation').value;
  const sex      = document.getElementById('member-sex').value || null;
  const birthDate = document.getElementById('member-birthdate').value || null;
  if (!name) return toast('Укажите имя', 'error');
  const btn = document.getElementById('save-member-btn');
  btn.disabled = true;
  try {
    if (editingMemberId) {
      const updated = await apiFetch(`/api/members/${editingMemberId}`, 'PUT', { name, sex, birthDate, relation });
      members = members.map(m => m.id === editingMemberId ? updated : m);
    } else {
      const created = await apiFetch('/api/members', 'POST', { name, sex, birthDate, relation });
      members.push(created);
    }
    renderMemberDropdown();
    renderMembersListProfile();
    closeOverlay('member-edit-overlay');
    toast(editingMemberId ? 'Профиль обновлён ✓' : 'Профиль добавлен ✓', 'success');
  } catch (e) {
    toast(e.message || 'Ошибка', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteMember(id) {
  const m = members.find(x => x.id === id);
  if (!confirm(`Удалить профиль "${m?.name}" и все его анализы?`)) return;
  try {
    await apiFetch(`/api/members/${id}`, 'DELETE');
    members = members.filter(x => x.id !== id);
    if (currentMemberId === id) await switchMember(null);
    renderMemberDropdown();
    renderMembersListProfile();
    toast('Профиль удалён', 'success');
  } catch (e) {
    toast(e.message || 'Ошибка', 'error');
  }
}

// ══════════════════════════════════════════════════════
// PDF IMPORT (6.1)
// ══════════════════════════════════════════════════════
let importedParams = [];

function openImportOverlay() {
  resetImport();
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  openOverlay('import-overlay');
}

function resetImport() {
  importedParams = [];
  document.getElementById('import-step-1')?.classList.remove('hidden');
  document.getElementById('import-step-2')?.classList.add('hidden');
  const inp = document.getElementById('import-pdf-input');
  if (inp) inp.value = '';
  const txt = document.getElementById('import-text-input');
  if (txt) txt.value = '';
  const zone = document.getElementById('import-drop-zone');
  if (zone) zone.classList.remove('drag-over');
}

async function handleImportPDF(input) {
  const file = input.files[0];
  if (!file) return;
  if (typeof pdfjsLib === 'undefined') { toast('PDF.js не загружен', 'error'); return; }
  const btn = document.getElementById('import-drop-zone');
  btn.classList.add('drag-over');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Sort items by y then x to reconstruct reading order
      const items = content.items.sort((a, b) =>
        Math.round(b.transform[5] / 5) * 5 - Math.round(a.transform[5] / 5) * 5 ||
        a.transform[4] - b.transform[4]
      );
      // Group into lines by y-coordinate proximity
      let lastY = null, line = [];
      for (const item of items) {
        const y = Math.round(item.transform[5] / 4) * 4;
        if (lastY !== null && Math.abs(y - lastY) > 6) {
          fullText += line.join('  ') + '\n';
          line = [];
        }
        line.push(item.str);
        lastY = y;
      }
      if (line.length) fullText += line.join('  ') + '\n';
    }
    document.getElementById('import-text-input').value = fullText;
    // Try to auto-detect lab name from text
    const labMatch = fullText.match(/инвитро|invitro|гемотест|gemotest|helix|хеликс|ситилаб|citilab/i);
    if (labMatch) document.getElementById('import-test-lab').value = labMatch[0].charAt(0).toUpperCase() + labMatch[0].slice(1).toLowerCase();
    parseImportText();
  } catch (e) {
    toast('Ошибка чтения PDF: ' + e.message, 'error');
    btn.classList.remove('drag-over');
  }
}

function parseLabText(rawText) {
  const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
  const results = [];
  const skipWords = /^(дата|время|пациент|врач|номер|бланк|страниц|результат|единиц|референс|норма|анализ|исследование|материал|статус|готов|заказ|лаборатор|пол:|возраст|телефон|адрес|www|http|©|итого|выдан|подпись)/i;

  // Pattern 1: Name   Value   Unit   Low - High  (standard format)
  const re1 = /^(.{3,45?}?)\s{2,}([\d][.,\d]*)\s+([\S]{1,15})\s+([\d.,]+)\s*[-–—]\s*([\d.,]+)/;
  // Pattern 2: Name   Value   Unit  (no ref range)
  const re2 = /^(.{3,45?}?)\s{2,}([\d][.,\d]*)\s+([\S]{1,15})\s*$/;
  // Pattern 3: pipe/tab separated  Name | Value | Unit | Ref
  const re3 = /^(.{3,40?}?)[|\t]([\d.,]+)[|\t]([\S]{1,15})[|\t]([\d.,]+)\s*[-–—]\s*([\d.,]+)/;

  for (const line of lines) {
    if (skipWords.test(line)) continue;
    if (line.length < 6 || line.length > 200) continue;
    // Skip lines that are mostly numbers (table borders, dates)
    if (/^\d[\d\s\/\-.:,]+$/.test(line)) continue;

    let m = line.match(re3) || line.match(re1);
    if (m) {
      const name = cleanParamName(m[1]);
      if (!name || name.length < 2) continue;
      results.push({
        name,
        value:   m[2].replace(',', '.'),
        unit:    m[3].replace(/[↑↓▲▼!*]/g, '').trim(),
        refLow:  parseFloat(m[4].replace(',', '.')) || '',
        refHigh: parseFloat(m[5].replace(',', '.')) || '',
      });
      continue;
    }
    m = line.match(re2);
    if (m) {
      const name = cleanParamName(m[1]);
      if (!name || name.length < 2) continue;
      // Try personalized refs as fallback
      const refs = getPersonalizedRefs(name);
      results.push({ name, value: m[2].replace(',', '.'), unit: m[3].trim(), refLow: refs?.refLow || '', refHigh: refs?.refHigh || '' });
    }
  }
  // Deduplicate by name
  const seen = new Set();
  return results.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });
}

function cleanParamName(raw) {
  return raw
    .replace(/\([\w\s]+\)/g, '')      // "(HGB)" abbreviations
    .replace(/[↑↓▲▼!*№#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseImportText() {
  const text = document.getElementById('import-text-input').value;
  if (!text.trim()) { toast('Нет текста для анализа', 'error'); return; }
  importedParams = parseLabText(text);
  if (!importedParams.length) { toast('Не удалось распознать показатели. Попробуйте скопировать текст вручную.', 'error'); return; }

  // Auto-fill date
  const dateMatch = text.match(/(\d{2})[.\-/](\d{2})[.\-/](\d{4})/);
  if (dateMatch) {
    document.getElementById('import-test-date').value = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  } else {
    document.getElementById('import-test-date').value = todayStr();
  }

  renderImportPreview();
  document.getElementById('import-step-1').classList.add('hidden');
  document.getElementById('import-step-2').classList.remove('hidden');
}

function renderImportPreview() {
  const tbody = document.getElementById('import-preview-body');
  tbody.innerHTML = importedParams.map((p, i) => `<tr>
    <td><input value="${esc(p.name)}" id="ip-name-${i}" onchange="importedParams[${i}].name=this.value"></td>
    <td><input value="${esc(p.value)}" id="ip-val-${i}" style="width:60px" onchange="importedParams[${i}].value=this.value"></td>
    <td><input value="${esc(p.unit)}" id="ip-unit-${i}" style="width:60px" onchange="importedParams[${i}].unit=this.value"></td>
    <td><input value="${p.refLow !== '' ? p.refLow : ''}–${p.refHigh !== '' ? p.refHigh : ''}" id="ip-ref-${i}" style="width:80px" onchange="updateImportRef(${i},this.value)"></td>
    <td><button class="btn btn-ghost btn-icon btn-sm" onclick="removeImportRow(${i})" style="padding:2px 6px;font-size:11px">✕</button></td>
  </tr>`).join('');
}

function updateImportRef(i, val) {
  const parts = val.split('–').map(s => s.trim());
  importedParams[i].refLow  = parts[0] || '';
  importedParams[i].refHigh = parts[1] || '';
}

function removeImportRow(i) {
  importedParams.splice(i, 1);
  renderImportPreview();
}

async function confirmImport() {
  const name     = document.getElementById('import-test-name').value.trim() || 'Импортированный анализ';
  const date     = document.getElementById('import-test-date').value || todayStr();
  const lab      = document.getElementById('import-test-lab').value.trim();
  const category = document.getElementById('import-test-category').value;
  if (!importedParams.length) { toast('Нет показателей для сохранения', 'error'); return; }

  const parameters = importedParams
    .filter(p => p.name && p.value)
    .map(p => ({ name: p.name, value: String(p.value), unit: p.unit, refLow: String(p.refLow), refHigh: String(p.refHigh) }));

  const btn = document.getElementById('confirm-import-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const payload = { name, date, category, lab, parameters, memberId: currentMemberId || undefined };
    const created = await apiFetch('/api/tests', 'POST', payload);
    tests.unshift(created);
    closeOverlay('import-overlay');
    renderDashboard(); renderTestList(); renderCharts();
    toast(`Импортировано ${parameters.length} показателей ✓`, 'success');
  } catch (e) {
    toast(e.message || 'Ошибка сохранения', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить анализ';
  }
}

// ══════════════════════════════════════════════════════
// JSON BACKUP / IMPORT (6.3)
// ══════════════════════════════════════════════════════
function importData() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Support both array of tests and full backup { tests, profile, members } format
      const importTests = Array.isArray(data) ? data : data.tests;
      if (!Array.isArray(importTests)) throw new Error('Неверный формат файла');
      if (!confirm(`Импортировать ${importTests.length} анализов? Существующие данные сохранятся.`)) return;

      // Use bulk /api/import if full backup format, otherwise post one-by-one
      if (!Array.isArray(data) && data.version) {
        const res = await apiFetch('/api/import', 'POST', data);
        await loadTests();
        toast(`Импортировано ${res.imported}, пропущено дублей: ${res.skipped} ✓`, 'success');
      } else {
        let imported = 0;
        for (const t of importTests) {
          if (!t.name || !t.date) continue;
          const { id: _id, userId: _uid, createdAt: _ca, ...rest } = t;
          await apiFetch('/api/tests', 'POST', { ...rest });
          imported++;
        }
        await loadTests();
        toast(`Импортировано ${imported} анализов ✓`, 'success');
      }
      localStorage.setItem('medlab_last_backup', todayStr());
      renderBackupStatus();
    } catch (err) {
      toast('Ошибка импорта: ' + err.message, 'error');
    }
  };
  input.click();
}

// ══════════════════════════════════════════════════════
// NOTIFICATIONS & REMINDERS (5.1)
// ══════════════════════════════════════════════════════
function updateNotifStatusLabel() {
  const el = document.getElementById('notif-status-label');
  if (!el) return;
  if (!('Notification' in window)) { el.textContent = 'Не поддерживается браузером'; return; }
  const labels = { granted: 'Включены ✓', denied: 'Заблокированы (изменить в настройках браузера)', default: 'Нажмите, чтобы включить' };
  el.textContent = labels[Notification.permission] || 'Неизвестно';
}

async function toggleNotifications() {
  if (!('Notification' in window)) { toast('Браузер не поддерживает уведомления', 'error'); return; }
  if (Notification.permission === 'denied') {
    toast('Уведомления заблокированы — разрешите в настройках браузера', 'error'); return;
  }
  if (Notification.permission === 'granted') {
    toast('Уведомления уже включены', 'success'); return;
  }
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

function renderNotifBanner() {
  const el = document.getElementById('notif-banner');
  if (!el) return;
  if (!('Notification' in window) || Notification.permission !== 'default') { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="notif-banner">
    <span style="font-size:20px">🔔</span>
    <span>Включите уведомления, чтобы получать напоминания о визитах к врачу</span>
    <button class="btn btn-primary btn-sm" onclick="toggleNotifications()">Включить</button>
  </div>`;
}

async function checkAndSendReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today  = todayStr();
  const sw     = await navigator.serviceWorker?.ready.catch(() => null);
  const todayKey = `medlab_notif_${today}`;
  const sent   = JSON.parse(localStorage.getItem(todayKey) || '[]');

  for (const t of tests) {
    if (!t.nextVisit) continue;
    const daysLeft = Math.round((new Date(t.nextVisit) - new Date(today)) / 86400000);
    if (daysLeft < 0 || daysLeft > 7) continue;
    if (sent.includes(t.id)) continue;

    const title = daysLeft === 0 ? 'MedLab — Визит сегодня!' : `MedLab — Визит через ${daysLeft} ${daysLeft === 1 ? 'день' : 'дня'}`;
    const body  = `${t.name}${t.doctor ? ' · ' + t.doctor : ''} — ${formatDate(t.nextVisit)}`;
    const opts  = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: `visit-${t.id}`, renotify: daysLeft === 0 };

    if (sw) {
      await sw.showNotification(title, opts);
    } else {
      new Notification(title, opts);
    }
    sent.push(t.id);
  }
  localStorage.setItem(todayKey, JSON.stringify(sent));
}

// ══════════════════════════════════════════════════════
// YEARLY SUMMARY (5.3)
// ══════════════════════════════════════════════════════
function renderYearlySummary() {
  const el = document.getElementById('yearly-summary');
  if (!el) return;
  const year = new Date().getFullYear();
  const yearTests = tests.filter(t => t.date && t.date.startsWith(String(year)));
  if (yearTests.length < 3) { el.innerHTML = ''; return; }

  // Category breakdown
  const catCount = {};
  yearTests.forEach(t => { catCount[t.category] = (catCount[t.category] || 0) + 1; });
  const maxCat   = Math.max(...Object.values(catCount));
  const catBars  = Object.entries(catCount)
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

  // Abnormal parameters (count by name)
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

  // Improved / worsened parameters (first vs last value in year, relative to range)
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
    const mid = rh && rl ? (rh + rl) / 2 : rh || rl;
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
      ${improved.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:10px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Улучшились</div><div class="summary-tags">${improved.slice(0,4).map(n=>`<span class="summary-tag good">↑ ${n}</span>`).join('')}</div>` : ''}
      ${worsened.length ? `<div style="font-size:11px;color:var(--text-3);margin-top:10px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Требуют внимания</div><div class="summary-tags">${worsened.slice(0,4).map(n=>`<span class="summary-tag bad">↓ ${n}</span>`).join('')}</div>` : ''}
    </div>`;
}

function getTestStatus(test) {
  if (!test.parameters?.length) return 'normal';
  let maxDevPct = 0;
  for (const p of test.parameters) {
    const val = parseFloat(p.value);
    let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
    let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
    if (refHigh === null && refLow === null) {
      const refs = getPersonalizedRefs(p.name);
      if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; }
    }
    if (refHigh !== null && !isNaN(refHigh) && val > refHigh)
      maxDevPct = Math.max(maxDevPct, ((val - refHigh) / refHigh) * 100);
    if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow)
      maxDevPct = Math.max(maxDevPct, ((refLow - val) / refLow) * 100);
  }
  if (maxDevPct === 0)   return 'normal';
  if (maxDevPct <= 20)   return 'mild';
  if (maxDevPct <= 50)   return 'moderate';
  return 'danger';
}

// ══════════════════════════════════════════════════════
// CALCULATED CLINICAL INDICATORS
// ══════════════════════════════════════════════════════
function getLatestParamValue(paramName) {
  for (const t of tests) {
    const p = (t.parameters || []).find(p => p.name === paramName);
    if (p) return { value: parseFloat(p.value), date: t.date };
  }
  return null;
}

function computeCalculatedIndicators() {
  const results = [];

  // 1. eGFR (CKD-EPI 2021) — requires Creatinine + age + sex
  const creatinine = getLatestParamValue('Креатинин');
  if (creatinine && currentUser?.birthDate && currentUser?.sex) {
    const age     = calcAge(currentUser.birthDate);
    const isFemale = currentUser.sex === 'female';
    const scrMgdl  = creatinine.value / 88.4;          // μmol/L → mg/dL
    const kappa    = isFemale ? 0.7  : 0.9;
    const alpha    = isFemale ? -0.241 : -0.302;
    const sexFactor = isFemale ? 1.012 : 1.0;
    const ratio    = scrMgdl / kappa;
    const egfr     = Math.round(142 * Math.pow(Math.min(ratio, 1), alpha) *
                     Math.pow(Math.max(ratio, 1), -1.200) * Math.pow(0.9938, age) * sexFactor);
    const [status, label] =
      egfr >= 90 ? ['normal',   'G1 — Норма (≥90)']              :
      egfr >= 60 ? ['mild',     'G2 — Незначительное снижение']  :
      egfr >= 45 ? ['moderate', 'G3a — Умеренное снижение']      :
      egfr >= 30 ? ['danger',   'G3b — Значительное снижение']   :
                   ['danger',   'G4-5 — Тяжёлая ХБП (<30)'];
    results.push({ name: 'СКФ (eGFR)', value: egfr, unit: 'мл/мин/1.73м²', status, label, date: creatinine.date });
  }

  // 2. HOMA-IR — requires Glucose + Insulin (fasting)
  const glucose = getLatestParamValue('Глюкоза') || getLatestParamValue('Глюкоза нат.');
  const insulin = getLatestParamValue('Инсулин');
  if (glucose && insulin) {
    const homa = (glucose.value * insulin.value) / 22.5;
    const [status, label] =
      homa < 2.7 ? ['normal',   'Норма (<2.7)']           :
      homa < 4.0 ? ['moderate', 'Инсулинорезистентность'] :
                   ['danger',   'Выраженная ИР (>4.0)'];
    results.push({ name: 'HOMA-IR', value: homa.toFixed(2), unit: 'у.е.', status, label, date: [glucose.date, insulin.date].sort().pop() });
  }

  // 3. Atherogenicity coefficient — requires Total Cholesterol + HDL
  const chol = getLatestParamValue('Холестерин общий');
  const hdl  = getLatestParamValue('ЛПВП');
  if (chol && hdl && hdl.value > 0) {
    const ka = ((chol.value - hdl.value) / hdl.value).toFixed(2);
    const [status, label] =
      ka < 2.5 ? ['normal',   'Оптимальный (<2.5)']  :
      ka < 3.0 ? ['mild',     'Допустимый (2.5–3.0)'] :
      ka < 4.0 ? ['moderate', 'Повышенный (3.0–4.0)'] :
                 ['danger',   'Высокий риск ССЗ (>4.0)'];
    results.push({ name: 'Коэф. атерогенности', value: ka, unit: 'у.е.', status, label, date: [chol.date, hdl.date].sort().pop() });
  }

  return results;
}

function renderCalculatedIndicators() {
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

function renderDashboard() {
  const now = new Date();
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

  const recent = tests.slice(0, 3);
  const container = document.getElementById('recent-tests');
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧪</div><div class="empty-title">Пока нет анализов</div><p>Добавьте первый анализ, чтобы начать отслеживать показатели</p><button class="btn btn-primary mt-3" onclick="openAddTest()">Добавить анализ</button></div>`;
  } else {
    container.innerHTML = recent.map(renderTestCard).join('');
  }
}

function renderUpcomingVisits() {
  const el = document.getElementById('upcoming-visits');
  if (!el) return;
  const today = todayStr();
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
      return `<div class="visit-card" onclick="showTestDetail('${t.id}')">
        <div class="visit-card-icon">📅</div>
        <div>
          <div class="visit-card-title">${t.name}</div>
          <div class="visit-card-sub">${formatDate(t.nextVisit)}${t.doctor ? ' · ' + t.doctor : ''}</div>
        </div>
        <div class="visit-days-badge ${urgent ? 'urgent' : ''}">${daysLeft === 0 ? 'Сегодня' : `через ${daysLeft}д`}</div>
      </div>`;
    }).join('')}`;
}

function renderTestCard(test) {
  const status = getTestStatus(test);
  const cat = CATEGORIES[test.category] || CATEGORIES.other;
  const badgeClass = { danger: 'badge-danger', moderate: 'badge-warning', mild: 'badge-mild', normal: 'badge-normal' }[status] || 'badge-normal';
  const badgeText  = { danger: '⚠ Значительное', moderate: '↕ Умеренное', mild: '~ Незначительное', normal: '✓ Норма' }[status] || '✓ Норма';
  const params = (test.parameters || []).slice(0, 4);
  const paramPills = params.map(p => {
    const val = parseFloat(p.value);
    let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
    let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
    if (refHigh === null && refLow === null) {
      const refs = getPersonalizedRefs(p.name);
      if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; }
    }
    let cls = '', dot = 'dot-ok';
    if (refHigh !== null && !isNaN(refHigh) && val > refHigh) { cls = 'out-high'; dot = 'dot-high'; }
    else if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow) { cls = 'out-low'; dot = 'dot-low'; }
    const trend = renderTrend(p.name, p.value, test.date);
    return `<div class="param-pill ${cls}"><span class="dot ${dot}"></span>${p.name}: <span class="val">${p.value}</span> <span class="text-muted">${p.unit}</span>${trend}</div>`;
  }).join('');

  const doctorLine = test.doctor ? `<span style="color:var(--teal);font-size:11px">👨‍⚕️ ${test.doctor}</span>` : '';
  return `<div class="test-card" onclick="showTestDetail('${test.id}')">
    <div class="test-card-header">
      <div>
        <div class="test-card-title">${cat.icon} ${test.name}</div>
        <div class="test-card-date">${formatDate(test.date)}${test.lab ? ' · ' + test.lab : ''}${doctorLine ? '  ' + doctorLine : ''}</div>
      </div>
      <span class="test-badge ${badgeClass}">${badgeText}</span>
    </div>
    ${paramPills ? `<div class="param-pills">${paramPills}</div>` : ''}
  </div>`;
}

function renderTestList() {
  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  let filtered = tests;
  if (currentCategory !== 'all') filtered = filtered.filter(t => t.category === currentCategory);
  if (query) filtered = filtered.filter(t =>
    t.name.toLowerCase().includes(query) ||
    (t.lab || '').toLowerCase().includes(query) ||
    (t.parameters || []).some(p => p.name.toLowerCase().includes(query))
  );
  const container = document.getElementById('all-tests');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Ничего не найдено</div><p>Попробуйте изменить фильтр или добавьте новый анализ</p></div>`;
  } else {
    container.innerHTML = filtered.map(renderTestCard).join('');
  }
}

function filterTests() { renderTestList(); }

function selectCategory(el, cat) {
  document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentCategory = cat;
  renderTestList();
}

// ══════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════
function renderCharts() {
  const container = document.getElementById('charts-container');
  // Collect all unique parameter names that appear in multiple tests
  const paramMap = {};
  for (const test of tests) {
    for (const p of (test.parameters || [])) {
      if (!paramMap[p.name]) paramMap[p.name] = [];
      paramMap[p.name].push({ date: test.date, value: parseFloat(p.value), unit: p.unit, refLow: parseFloat(p.refLow) || null, refHigh: parseFloat(p.refHigh) || null });
    }
  }
  // Only show params with 2+ data points
  const trackable = Object.entries(paramMap).filter(([, arr]) => arr.length >= 2).sort((a, b) => b[1].length - a[1].length);

  if (!trackable.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-title">Нет данных для графиков</div><p>Добавьте минимум 2 анализа с одинаковыми показателями для отображения динамики</p></div>`;
    return;
  }

  container.innerHTML = trackable.map(([name]) => `<div class="chart-container"><div class="chart-header"><div><div class="chart-title">${name}</div></div></div><canvas id="chart-${slugify(name)}" height="160"></canvas></div>`).join('');

  for (const [name, points] of trackable) {
    const sorted = points.sort((a, b) => new Date(a.date) - new Date(b.date));
    const ctx = document.getElementById('chart-' + slugify(name))?.getContext('2d');
    if (!ctx) continue;

    const refLow = sorted[0].refLow;
    const refHigh = sorted[0].refHigh;
    const colors = sorted.map(p => {
      if (refHigh && p.value > refHigh) return '#EF4444';
      if (refLow && p.value < refLow) return '#F59E0B';
      return '#00C9A7';
    });

    const datasets = [{
      label: name,
      data: sorted.map(p => p.value),
      borderColor: '#00C9A7',
      backgroundColor: 'rgba(0,201,167,0.08)',
      pointBackgroundColor: colors,
      pointBorderColor: colors,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      fill: true,
    }];

    if (refHigh) datasets.push({ label: 'Верхняя норма', data: sorted.map(() => refHigh), borderColor: 'rgba(239,68,68,0.4)', borderDash: [4, 4], pointRadius: 0, fill: false });
    if (refLow && refLow > 0) datasets.push({ label: 'Нижняя норма', data: sorted.map(() => refLow), borderColor: 'rgba(245,158,11,0.4)', borderDash: [4, 4], pointRadius: 0, fill: false });

    if (charts[name]) charts[name].destroy();
    charts[name] = new Chart(ctx, {
      type: 'line',
      data: { labels: sorted.map(p => formatDate(p.date)), datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0C1120',
            borderColor: 'rgba(0,201,167,0.2)',
            borderWidth: 1,
            titleColor: '#F0F4FF',
            bodyColor: '#8B9CC8',
            callbacks: { label: ctx => `${ctx.parsed.y} ${sorted[0].unit}` }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A80', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A80', font: { size: 11 } } }
        }
      }
    });
  }
}

// ══════════════════════════════════════════════════════
// TEST DETAIL
// ══════════════════════════════════════════════════════
function showTestDetail(id) {
  const test = tests.find(t => t.id === id);
  if (!test) return;
  const cat = CATEGORIES[test.category] || CATEGORIES.other;
  const status = getTestStatus(test);
  const statusText  = { normal: '✓ Все в норме', mild: '~ Незначительные отклонения', moderate: '↕ Умеренные отклонения', danger: '⚠ Значительные отклонения' }[status] || '✓ Все в норме';
  const badgeClass  = { normal: 'badge-normal', mild: 'badge-mild', moderate: 'badge-warning', danger: 'badge-danger' }[status] || 'badge-normal';

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
    const refStr = (refLow !== null && refHigh !== null) ? `${refLow} – ${refHigh}` : (refHigh !== null ? `< ${refHigh}` : '—');
    const personalTag = refSource === 'personal' ? `<span style="font-size:9px;color:var(--teal);margin-left:4px" title="Персональная норма">★</span>` : '';
    const trend = renderTrend(p.name, p.value, test.date);
    return `<tr>
      <td>${p.name}</td>
      <td class="param-val" style="color:${valColor}">${p.value}${trend} <span class="text-muted text-xs">${p.unit}</span></td>
      <td class="ref-range">${refStr}${personalTag} <span class="text-muted">${p.unit}</span></td>
      <td>${statusChip}</td>
    </tr>`;
  }).join('');

  document.getElementById('detail-content').innerHTML = `
    <div class="flex gap-2" style="align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700">${cat.icon} ${test.name}</div>
        <div class="text-muted text-sm mt-1">${formatDate(test.date)}${test.lab ? ' · ' + test.lab : ''}</div>
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
      ${test.doctor ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><span style="font-size:18px">👨‍⚕️</span><div><div style="font-size:14px;font-weight:600">${test.doctor}</div><div class="text-xs text-muted">Назначивший врач</div></div></div>` : ''}
      ${test.nextVisit ? `<div style="display:flex;gap:8px;align-items:center"><span style="font-size:18px">📅</span><div><div style="font-size:14px;font-weight:600">${formatDate(test.nextVisit)}</div><div class="text-xs text-muted">Следующий визит</div></div></div>` : ''}
    </div>` : ''}

    ${test.conclusion ? `<div class="detail-section">
      <div class="detail-section-title">Заключение врача</div>
      <div class="detail-conclusion">${test.conclusion}</div>
    </div>` : ''}

    ${test.notes ? `<div class="detail-section">
      <div class="detail-section-title">Примечания</div>
      <div class="detail-note">${test.notes}</div>
    </div>` : ''}

    ${test.attachment ? `<div class="detail-section">
      <div class="detail-section-title">Прикреплённый файл</div>
      ${renderAttachmentPreview(test.attachment)}
    </div>` : ''}

    <div class="flex gap-2 mt-4">
      <button class="btn btn-ghost" style="flex:1" onclick="closeOverlay('detail-overlay')">Закрыть</button>
      <button class="btn btn-ghost btn-sm" onclick="printTestReport('${test.id}')" title="Экспорт в PDF">📄 PDF</button>
      <button class="btn btn-ghost" style="flex:1" onclick="editTest('${test.id}')">✏️ Редактировать</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTest('${test.id}')">🗑</button>
    </div>`;

  openOverlay('detail-overlay');
}

// ══════════════════════════════════════════════════════
// ADD / EDIT TEST
// ══════════════════════════════════════════════════════
function openAddTest() {
  editingTestId = null;
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
  document.getElementById('attachment-preview').innerHTML = '';
  document.getElementById('attachment-zone-label').textContent = '📎 Нажмите или перетащите файл';
  document.getElementById('test-attachment').value = '';
  currentAttachment = null;
  paramRowCount = 0;
  addParamRow();
  openOverlay('add-test-overlay');
}

function editTest(id) {
  closeOverlay('detail-overlay');
  const test = tests.find(t => t.id === id);
  if (!test) return;
  editingTestId = id;
  document.getElementById('drawer-title').textContent = 'Редактировать анализ';
  document.getElementById('test-name').value = test.name;
  document.getElementById('test-date').value = test.date;
  document.getElementById('test-lab').value = test.lab || '';
  document.getElementById('test-doctor').value = test.doctor || '';
  document.getElementById('test-next-visit').value = test.nextVisit || '';
  document.getElementById('test-conclusion').value = test.conclusion || '';
  document.getElementById('test-notes').value = test.notes || '';
  document.getElementById('test-category').value = test.category;
  document.getElementById('params-list').innerHTML = '';
  document.getElementById('test-attachment').value = '';
  currentAttachment = test.attachment || null;
  document.getElementById('attachment-preview').innerHTML = currentAttachment ? renderAttachmentPreview(currentAttachment) : '';
  document.getElementById('attachment-zone-label').textContent = currentAttachment ? `📎 ${currentAttachment.name}` : '📎 Нажмите или перетащите файл';
  paramRowCount = 0;
  if (test.parameters?.length) {
    test.parameters.forEach(p => addParamRow(p));
  } else {
    addParamRow();
  }
  openOverlay('add-test-overlay');
}

function addParamRow(data = {}) {
  const i = paramRowCount++;
  const row = document.createElement('div');
  row.className = 'param-form-row';
  row.id = `param-row-${i}`;
  row.innerHTML = `
    <input type="text" class="form-input" placeholder="Показатель" value="${data.name || ''}" id="p-name-${i}">
    <input type="number" class="form-input" placeholder="0.0" value="${data.value || ''}" id="p-val-${i}" step="any">
    <input type="text" class="form-input" placeholder="г/л" value="${data.unit || ''}" id="p-unit-${i}">
    <input type="text" class="form-input" placeholder="0-100" value="${data.refLow !== undefined ? data.refLow : ''}–${data.refHigh !== undefined ? data.refHigh : ''}" id="p-ref-${i}" title="Норма: нижн–верхн, напр. 120–160">
    <button class="btn btn-ghost btn-icon" onclick="document.getElementById('param-row-${i}').remove()" title="Удалить">✕</button>`;
  document.getElementById('params-list').appendChild(row);
}

async function saveTest() {
  const name = document.getElementById('test-name').value.trim();
  const date = document.getElementById('test-date').value;
  const category = document.getElementById('test-category').value;
  if (!name) return toast('Укажите название анализа', 'error');
  if (!date) return toast('Укажите дату', 'error');

  // Collect parameters
  const parameters = [];
  document.querySelectorAll('#params-list .param-form-row').forEach(row => {
    const id = row.id.split('-').pop();
    const paramName = document.getElementById(`p-name-${id}`)?.value.trim();
    const val = document.getElementById(`p-val-${id}`)?.value;
    const unit = document.getElementById(`p-unit-${id}`)?.value.trim();
    const refRaw = document.getElementById(`p-ref-${id}`)?.value || '';
    if (!paramName || !val) return;
    const refParts = refRaw.split('–').map(s => s.trim());
    parameters.push({
      name: paramName, value: val, unit,
      refLow: refParts[0] || '', refHigh: refParts[1] || ''
    });
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
    attachment: currentAttachment || null,
    memberId:   currentMemberId || undefined,
    parameters,
  };

  const btn = document.getElementById('save-test-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';

  try {
    if (editingTestId) {
      const updated = await apiFetch(`/api/tests/${editingTestId}`, 'PUT', payload);
      tests = tests.map(t => t.id === editingTestId ? updated : t);
      toast('Анализ обновлён ✓', 'success');
    } else {
      const created = await apiFetch('/api/tests', 'POST', payload);
      tests.unshift(created);
      toast('Анализ добавлен ✓', 'success');
    }
    closeOverlay('add-test-overlay');
    renderDashboard();
    renderTestList();
    renderCharts();
  } catch (e) {
    toast(e.message || 'Ошибка сохранения', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

async function deleteTest(id) {
  if (!confirm('Удалить этот анализ?')) return;
  try {
    await apiFetch(`/api/tests/${id}`, 'DELETE');
    tests = tests.filter(t => t.id !== id);
    closeOverlay('detail-overlay');
    renderDashboard();
    renderTestList();
    renderCharts();
    toast('Анализ удалён', 'success');
  } catch {
    toast('Ошибка удаления', 'error');
  }
}

// ══════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');
  if (name === 'charts') renderCharts();
}

// ══════════════════════════════════════════════════════
// OVERLAYS
// ══════════════════════════════════════════════════════
function openOverlay(id) { document.getElementById(id).classList.add('open'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('open'); }
function closeOverlayIfBg(e, id) { if (e.target.id === id) closeOverlay(id); }

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function openHtmlInNewTab(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ══════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════
async function exportData() {
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

function renderBackupStatus() {
  const el = document.getElementById('backup-status-sub');
  if (!el) return;
  const last = localStorage.getItem('medlab_last_backup');
  if (!last) { el.textContent = 'Бэкап никогда не создавался'; return; }
  const days = Math.round((new Date(todayStr()) - new Date(last)) / 86400000);
  el.textContent = days === 0 ? 'Последний бэкап: сегодня ✓' : `Последний бэкап: ${days} дн. назад${days > 30 ? ' ⚠' : ''}`;
}

// ══════════════════════════════════════════════════════
// API HELPER
// ══════════════════════════════════════════════════════
async function apiFetch(url, method = 'GET', body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка сети');
  return data;
}

// ══════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span> ${msg}`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-zа-я0-9]/gi, '-').replace(/-+/g, '-');
}

// ══════════════════════════════════════════════════════
// PROFILE EDIT
// ══════════════════════════════════════════════════════
function openProfileEdit() {
  document.getElementById('edit-name').value = currentUser.name || '';
  document.getElementById('edit-sex').value = currentUser.sex || '';
  document.getElementById('edit-birthdate').value = currentUser.birthDate || '';
  openOverlay('profile-edit-overlay');
}

async function saveProfile() {
  const name = document.getElementById('edit-name').value.trim();
  const sex = document.getElementById('edit-sex').value || null;
  const birthDate = document.getElementById('edit-birthdate').value || null;
  if (!name) return toast('Укажите имя', 'error');
  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const updated = await apiFetch('/api/auth/profile', 'PUT', { name, sex, birthDate });
    currentUser = { ...currentUser, ...updated };
    const initial = (currentUser.name || 'U')[0].toUpperCase();
    document.getElementById('user-avatar').textContent = initial;
    document.getElementById('profile-avatar').textContent = initial;
    document.getElementById('profile-name').textContent = currentUser.name;
    updateProfileMetaSub();
    closeOverlay('profile-edit-overlay');
    toast('Профиль обновлён ✓', 'success');
    // Re-render with updated reference ranges
    renderDashboard();
    renderTestList();
  } catch (e) {
    toast(e.message || 'Ошибка сохранения', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}

// ══════════════════════════════════════════════════════
// ATTACHMENT
// ══════════════════════════════════════════════════════
function handleAttachmentChange(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    toast('Файл слишком большой (макс. 3 МБ)', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentAttachment = { name: file.name, type: file.type, dataUrl: e.target.result };
    document.getElementById('attachment-zone-label').textContent = `📎 ${file.name}`;
    document.getElementById('attachment-preview').innerHTML = renderAttachmentPreview(currentAttachment);
  };
  reader.readAsDataURL(file);
}

function renderAttachmentPreview(att) {
  if (!att) return '';
  if (att.type && att.type.startsWith('image/')) {
    return `<div class="attachment-preview"><img src="${att.dataUrl}" alt="${att.name}"></div>`;
  }
  return `<div class="attachment-file-badge">📄 <span>${att.name}</span><a href="${att.dataUrl}" download="${att.name}" style="margin-left:auto;color:var(--teal);font-size:12px">Скачать</a></div>`;
}

// ══════════════════════════════════════════════════════
// PDF / PRINT REPORT
// ══════════════════════════════════════════════════════
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function printTestReport(id) {
  const test = tests.find(t => t.id === id);
  if (!test) return;
  const cat = CATEGORIES[test.category] || CATEGORIES.other;

  const paramsRows = (test.parameters || []).map(p => {
    const val = parseFloat(p.value);
    let refHigh = (p.refHigh !== '' && p.refHigh !== undefined) ? parseFloat(p.refHigh) : null;
    let refLow  = (p.refLow  !== '' && p.refLow  !== undefined) ? parseFloat(p.refLow)  : null;
    if (refHigh === null && refLow === null) {
      const refs = getPersonalizedRefs(p.name);
      if (refs) { refHigh = refs.refHigh; refLow = refs.refLow; }
    }
    let stText = 'Норма', stColor = '#10B981';
    if (refHigh !== null && !isNaN(refHigh) && val > refHigh) { stText = '↑ Выше нормы'; stColor = '#EF4444'; }
    else if (refLow !== null && !isNaN(refLow) && refLow > 0 && val < refLow) { stText = '↓ Ниже нормы'; stColor = '#F59E0B'; }
    const refStr = (refLow !== null && refHigh !== null) ? `${refLow} – ${refHigh}` : refHigh !== null ? `< ${refHigh}` : '—';
    return `<tr><td>${esc(p.name)}</td><td style="font-weight:600;color:${stColor}">${esc(p.value)} ${esc(p.unit)}</td><td>${refStr} ${esc(p.unit)}</td><td style="color:${stColor}">${stText}</td></tr>`;
  }).join('');

  const patientLine = [
    currentUser?.name,
    currentUser?.birthDate ? calcAge(currentUser.birthDate) + ' лет' : null,
    currentUser?.sex === 'male' ? 'Мужской' : currentUser?.sex === 'female' ? 'Женский' : null,
  ].filter(Boolean).join(' · ');

  const calcItems = computeCalculatedIndicators();
  const calcRows = calcItems.map(i =>
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

function printFullReport() {
  if (!tests.length) { toast('Нет анализов для отчёта', 'error'); return; }

  const patientLine = [
    currentUser?.name,
    currentUser?.birthDate ? calcAge(currentUser.birthDate) + ' лет' : null,
    currentUser?.sex === 'male' ? 'Мужской' : currentUser?.sex === 'female' ? 'Женский' : null,
  ].filter(Boolean).join(' · ');

  const calcItems = computeCalculatedIndicators();
  const calcRows  = calcItems.map(i =>
    `<tr><td>${esc(i.name)}</td><td>${esc(i.value)} ${esc(i.unit)}</td><td>${esc(i.label)}</td><td>${formatDate(i.date)}</td></tr>`
  ).join('');

  const testsHTML = tests.map(test => {
    const cat = CATEGORIES[test.category] || CATEGORIES.other;
    const status = getTestStatus(test);
    const statusLabel = { normal: '✓ Норма', mild: '~ Незначительное', moderate: '↕ Умеренное', danger: '⚠ Значительное' }[status];
    const rows = (test.parameters || []).map(p => {
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

// Close member dropdown when clicking outside
document.addEventListener('click', e => {
  const wrap = document.getElementById('member-switcher-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('member-dropdown')?.classList.add('hidden');
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllDropdowns();
    document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  }
});
