// ══════════════════════════════════════════════════════
// FAMILY MEMBERS
// ══════════════════════════════════════════════════════
import {
  members, setMembers, currentMemberId, setCurrentMemberId,
  currentUser, editingMemberId, setEditingMemberId,
} from './state.js';
import { apiFetch } from './api.js';
import { escapeHTML, toast, calcAge } from './utils.js';
import { openOverlay, closeOverlay, showPage } from './navigation.js';

export const RELATIONS = { partner: 'Партнёр', child: 'Ребёнок', parent: 'Родитель', other: 'Другое' };
const RELATION_ICONS   = { partner: '💑',       child: '👶',       parent: '👴',       other: '👤'    };

export async function loadMembers() {
  try {
    setMembers(await apiFetch('/api/members'));
    renderMemberDropdown();
    renderMembersListProfile();
  } catch {
    setMembers([]);
  }
}

export function renderMemberDropdown() {
  const el = document.getElementById('member-dropdown');
  if (!el) return;
  const self       = currentUser;
  const selfActive = currentMemberId === null;
  el.innerHTML = `
    <div class="member-option ${selfActive ? 'active' : ''}" onclick="switchMember(null)">
      <div class="member-option-avatar" style="background:linear-gradient(135deg,var(--teal),var(--blue))">${escapeHTML((self?.name || 'Я')[0])}</div>
      <div><div style="font-size:13px;font-weight:${selfActive ? '700' : '500'}">${escapeHTML(self?.name || 'Я')}</div><div style="font-size:11px;color:var(--text-3)">Мой профиль</div></div>
      ${selfActive ? '<span style="margin-left:auto;color:var(--teal);font-size:12px">✓</span>' : ''}
    </div>
    ${members.map(m => {
      const active = currentMemberId === m.id;
      return `<div class="member-option ${active ? 'active' : ''}" onclick="switchMember('${escapeHTML(m.id)}')">
        <div class="member-option-avatar">${escapeHTML(m.name[0])}</div>
        <div><div style="font-size:13px;font-weight:${active ? '700' : '500'}">${escapeHTML(m.name)}</div><div style="font-size:11px;color:var(--text-3)">${escapeHTML(RELATIONS[m.relation] || 'Другое')}${m.birthDate ? ' · ' + calcAge(m.birthDate) + ' лет' : ''}</div></div>
        ${active ? '<span style="margin-left:auto;color:var(--teal);font-size:12px">✓</span>' : ''}
      </div>`;
    }).join('')}
    <div class="member-option-footer" onclick="closeAllDropdowns();showPage('profile')">👨‍👩‍👧 Управление профилями</div>`;

  const btn   = document.getElementById('member-switch-btn');
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

export function renderMembersListProfile() {
  const el = document.getElementById('members-list-profile');
  if (!el) return;
  if (!members.length) { el.innerHTML = ''; return; }
  el.innerHTML = members.map(m => `
    <div class="settings-item">
      <div class="settings-item-left">
        <div class="settings-item-icon" style="background:rgba(139,92,246,0.12);font-size:16px">${RELATION_ICONS[m.relation] || '👤'}</div>
        <div>
          <div class="settings-item-title">${escapeHTML(m.name)}</div>
          <div class="settings-item-sub">${RELATIONS[m.relation] || ''}${m.sex ? ' · ' + (m.sex === 'male' ? 'М' : 'Ж') : ''}${m.birthDate ? ' · ' + calcAge(m.birthDate) + ' лет' : ''}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" onclick="openEditMember('${m.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMember('${m.id}')">🗑</button>
      </div>
    </div>`).join('');
}

export function toggleMemberDropdown() {
  document.getElementById('member-dropdown')?.classList.toggle('hidden');
}

export function closeAllDropdowns() {
  document.getElementById('member-dropdown')?.classList.add('hidden');
}

export async function switchMember(memberId) {
  setCurrentMemberId(memberId || null);
  closeAllDropdowns();
  renderMemberDropdown();
  const titleEl = document.getElementById('analyses-page-title');
  if (titleEl) {
    const m = members.find(x => x.id === currentMemberId);
    titleEl.textContent = currentMemberId ? `Анализы: ${m?.name || ''}` : 'Мои анализы';
  }
  // loadTests is imported lazily to avoid circular dep
  const { loadTests } = await import('./tests.js');
  await loadTests();
}

export function openAddMember() {
  setEditingMemberId(null);
  document.getElementById('member-overlay-title').textContent = 'Добавить профиль';
  document.getElementById('member-name').value = '';
  document.getElementById('member-relation').value = 'partner';
  document.getElementById('member-sex').value = '';
  document.getElementById('member-birthdate').value = '';
  document.getElementById('save-member-btn').textContent = 'Добавить';
  openOverlay('member-edit-overlay');
}

export function openEditMember(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  setEditingMemberId(id);
  document.getElementById('member-overlay-title').textContent = 'Редактировать профиль';
  document.getElementById('member-name').value    = m.name;
  document.getElementById('member-relation').value = m.relation || 'other';
  document.getElementById('member-sex').value     = m.sex || '';
  document.getElementById('member-birthdate').value = m.birthDate || '';
  document.getElementById('save-member-btn').textContent = 'Сохранить';
  openOverlay('member-edit-overlay');
}

export async function saveMember() {
  const name      = document.getElementById('member-name').value.trim();
  const relation  = document.getElementById('member-relation').value;
  const sex       = document.getElementById('member-sex').value || null;
  const birthDate = document.getElementById('member-birthdate').value || null;
  if (!name) return toast('Укажите имя', 'error');
  const btn = document.getElementById('save-member-btn');
  btn.disabled = true;
  try {
    if (editingMemberId) {
      const updated = await apiFetch(`/api/members/${editingMemberId}`, 'PUT', { name, sex, birthDate, relation });
      setMembers(members.map(m => m.id === editingMemberId ? updated : m));
    } else {
      const created = await apiFetch('/api/members', 'POST', { name, sex, birthDate, relation });
      setMembers([...members, created]);
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

export async function deleteMember(id) {
  const m = members.find(x => x.id === id);
  if (!confirm(`Удалить профиль "${m?.name}" и все его анализы?`)) return;
  try {
    await apiFetch(`/api/members/${id}`, 'DELETE');
    setMembers(members.filter(x => x.id !== id));
    if (currentMemberId === id) await switchMember(null);
    renderMemberDropdown();
    renderMembersListProfile();
    toast('Профиль удалён', 'success');
  } catch (e) {
    toast(e.message || 'Ошибка', 'error');
  }
}
