// ══════════════════════════════════════════════════════
// AUTH & PROFILE
// ══════════════════════════════════════════════════════
import {
  setToken, currentUser, setCurrentUser, setTests,
} from './state.js';
import { apiFetch, renderBackupStatus } from './api.js';
import { toast, calcAge } from './utils.js';
import { openOverlay, closeOverlay } from './navigation.js';
import { updateNotifStatusLabel } from './dashboard.js';
import { escapeHTML } from './utils.js';

export function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

export async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) return toast('Заполните все поля', 'error');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Вход...';
  try {
    const data = await apiFetch('/api/auth/login', 'POST', { email, password });
    setToken(data.token);
    setCurrentUser(data.user);
    localStorage.setItem('medlab_token', data.token);
    enterApp();
  } catch (e) {
    toast(e.message || 'Неверный логин или пароль', 'error');
    btn.disabled = false; btn.textContent = 'Войти';
  }
}

export async function register() {
  const name      = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-password').value;
  const sex       = document.getElementById('reg-sex').value || null;
  const birthDate = document.getElementById('reg-birthdate').value || null;
  if (!name || !email || !password) return toast('Заполните все поля', 'error');
  if (password.length < 8) return toast('Пароль минимум 8 символов', 'error');
  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await apiFetch('/api/auth/register', 'POST', { name, email, password, sex, birthDate });
    setToken(data.token);
    setCurrentUser(data.user);
    localStorage.setItem('medlab_token', data.token);
    enterApp();
  } catch (e) {
    toast(e.message || 'Ошибка регистрации', 'error');
    btn.disabled = false; btn.textContent = 'Создать аккаунт';
  }
}

export async function logout() {
  try { await apiFetch('/api/auth/logout', 'POST'); } catch {}
  setToken(null);
  setCurrentUser(null);
  setTests([]);
  localStorage.removeItem('medlab_token');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

export function openDeleteAccount() {
  document.getElementById('delete-account-password').value = '';
  openOverlay('delete-account-overlay');
}

export async function deleteAccount() {
  const password = document.getElementById('delete-account-password').value;
  if (!password) return toast('Введите пароль', 'error');
  const btn = document.getElementById('delete-account-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    await apiFetch('/api/account', 'DELETE', { password });
    setToken(null); setCurrentUser(null); setTests([]);
    localStorage.removeItem('medlab_token');
    closeOverlay('delete-account-overlay');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    toast('Аккаунт удалён', 'success');
  } catch (e) {
    toast(e.message || 'Ошибка удаления', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Удалить навсегда';
  }
}

export function openResetPassword() {
  document.getElementById('reset-email').value = document.getElementById('login-email')?.value || '';
  document.getElementById('reset-step-1').classList.remove('hidden');
  document.getElementById('reset-step-2').classList.add('hidden');
  document.getElementById('reset-token-input').value = '';
  document.getElementById('reset-new-password').value = '';
  openOverlay('reset-password-overlay');
}

export async function requestPasswordReset() {
  const email = document.getElementById('reset-email').value.trim();
  if (!email) return toast('Введите email', 'error');
  const btn = document.getElementById('reset-request-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await apiFetch('/api/auth/reset-password-request', 'POST', { email });
    document.getElementById('reset-step-1').classList.add('hidden');
    document.getElementById('reset-step-2').classList.remove('hidden');
    if (res.token) {
      document.getElementById('reset-token-info').innerHTML =
        `<strong>Токен сброса (dev-режим):</strong><br>${escapeHTML(res.token)}<br><span style="font-size:11px;opacity:0.7">Действует ${escapeHTML(res.expiresIn || '1 час')}</span>`;
      document.getElementById('reset-token-input').value = res.token;
    } else {
      document.getElementById('reset-token-info').textContent = 'Токен отправлен на ваш email.';
    }
  } catch (e) {
    toast(e.message || 'Ошибка', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Получить токен';
  }
}

export async function confirmPasswordReset() {
  const resetToken = document.getElementById('reset-token-input').value.trim();
  const password   = document.getElementById('reset-new-password').value;
  if (!resetToken) return toast('Введите токен', 'error');
  if (password.length < 8) return toast('Пароль минимум 8 символов', 'error');
  const btn = document.getElementById('reset-confirm-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    await apiFetch('/api/auth/reset-password', 'POST', { token: resetToken, password });
    closeOverlay('reset-password-overlay');
    toast('Пароль изменён. Войдите с новым паролем.', 'success');
  } catch (e) {
    toast(e.message || 'Ошибка сброса пароля', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сменить пароль';
  }
}

export function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  const initial = (currentUser.name || 'U')[0].toUpperCase();
  document.getElementById('user-avatar').textContent   = initial;
  document.getElementById('profile-avatar').textContent = initial;
  document.getElementById('profile-name').textContent  = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
  updateProfileMetaSub();
  updateNotifStatusLabel();
  renderBackupStatus();
  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  document.getElementById('greeting-text').textContent = `${greet}, ${currentUser.name.split(' ')[0]}! 👋`;
  document.getElementById('greeting-date').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  checkDisclaimer();
  import('./members.js').then(({ loadMembers }) =>
    loadMembers().then(() => import('./tests.js').then(({ loadTests }) => loadTests()))
  );
}

export function updateProfileMetaSub() {
  const el = document.getElementById('profile-meta-sub');
  if (!el) return;
  const sexLabel = currentUser.sex === 'male' ? 'Мужской' : currentUser.sex === 'female' ? 'Женский' : null;
  const ageLabel = currentUser.birthDate ? calcAge(currentUser.birthDate) + ' лет' : null;
  const parts    = [sexLabel, ageLabel].filter(Boolean);
  el.textContent = parts.length ? parts.join(' · ') : 'Пол и дата рождения не указаны';
}

export function checkDisclaimer() {
  if (!localStorage.getItem('medlab_disclaimer_v1')) {
    document.getElementById('disclaimer-overlay').classList.add('open');
  }
}

export function acceptDisclaimer() {
  localStorage.setItem('medlab_disclaimer_v1', '1');
  closeOverlay('disclaimer-overlay');
}

export function openProfileEdit() {
  document.getElementById('edit-name').value      = currentUser.name || '';
  document.getElementById('edit-sex').value       = currentUser.sex || '';
  document.getElementById('edit-birthdate').value = currentUser.birthDate || '';
  openOverlay('profile-edit-overlay');
}

export async function saveProfile() {
  const name      = document.getElementById('edit-name').value.trim();
  const sex       = document.getElementById('edit-sex').value || null;
  const birthDate = document.getElementById('edit-birthdate').value || null;
  if (!name) return toast('Укажите имя', 'error');
  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
  try {
    const updated = await apiFetch('/api/auth/profile', 'PUT', { name, sex, birthDate });
    setCurrentUser({ ...currentUser, ...updated });
    const initial = (currentUser.name || 'U')[0].toUpperCase();
    document.getElementById('user-avatar').textContent    = initial;
    document.getElementById('profile-avatar').textContent = initial;
    document.getElementById('profile-name').textContent   = currentUser.name;
    updateProfileMetaSub();
    closeOverlay('profile-edit-overlay');
    toast('Профиль обновлён ✓', 'success');
    import('./dashboard.js').then(({ renderDashboard }) => renderDashboard());
    import('./tests.js').then(({ renderTestList }) => renderTestList());
  } catch (e) {
    toast(e.message || 'Ошибка сохранения', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить';
  }
}
