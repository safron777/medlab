'use strict';
/* global Chart, pdfjsLib */

// ══════════════════════════════════════════════════════
// MAIN ENTRY POINT — wires ES modules + window exports
// ══════════════════════════════════════════════════════
import { token, setToken, setCurrentUser } from './state.js';
import { apiFetch, exportData, exportCsv, renderBackupStatus } from './api.js';
import { toast, todayStr } from './utils.js';
import { initNavigationListeners, showPage, openOverlay, closeOverlay, closeOverlayIfBg } from './navigation.js';
import {
  switchAuthTab, login, register, logout,
  openDeleteAccount, deleteAccount,
  openResetPassword, requestPasswordReset, confirmPasswordReset,
  enterApp, acceptDisclaimer, openProfileEdit, saveProfile,
} from './auth.js';
import {
  toggleMemberDropdown, closeAllDropdowns, switchMember,
  openAddMember, openEditMember, saveMember, deleteMember,
} from './members.js';
import {
  openImportOverlay, handleImportPDF, parseImportText,
  confirmImport, updateImportRef, removeImportRow, updateImportParamField,
} from './pdf-import.js';
import {
  loadTests, filterTests, selectCategory, showTestDetail,
  openAddTest, editTest, addParamRow, saveTest, deleteTest,
  handleAttachmentChange, removeAttachment, printTestReport, printFullReport, loadQuickParams,
} from './tests.js';
import { toggleNotifications } from './dashboard.js';

// ── JSON Backup import (inline — uses apiFetch from api.js) ────────────────
async function importData() {
  const input    = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const importTests = Array.isArray(data) ? data : data.tests;
      if (!Array.isArray(importTests)) throw new Error('Неверный формат файла');
      if (!confirm(`Импортировать ${importTests.length} анализов? Существующие данные сохранятся.`)) return;

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

// ── DOMContentLoaded ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  document.getElementById('test-date').value = todayStr();
  initNavigationListeners();

  if (token) {
    try {
      const res = await apiFetch('/api/auth/me');
      setCurrentUser(res);
      enterApp();
    } catch {
      setToken(null);
      localStorage.removeItem('medlab_token');
    }
  }

  // Handle password reset link from email (?resetToken=...)
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('resetToken');
  if (resetToken) {
    openResetPassword();
    // Skip step 1 (email input) — jump straight to step 2 (new password)
    document.getElementById('reset-step-1').classList.add('hidden');
    document.getElementById('reset-step-2').classList.remove('hidden');
    document.getElementById('reset-token-info').textContent = 'Введите новый пароль для вашего аккаунта.';
    document.getElementById('reset-token-input').value = resetToken;
    // Remove token from URL without page reload
    history.replaceState(null, '', window.location.pathname);
  }
});

// ── Window exports (for HTML inline handlers) ─────────────────────────────
Object.assign(window, {
  // Auth
  switchAuthTab, login, register, logout,
  openDeleteAccount, deleteAccount,
  openResetPassword, requestPasswordReset, confirmPasswordReset,
  acceptDisclaimer, openProfileEdit, saveProfile,
  // Navigation / overlays
  showPage, openOverlay, closeOverlay, closeOverlayIfBg,
  // Members
  toggleMemberDropdown, closeAllDropdowns, switchMember,
  openAddMember, openEditMember, saveMember, deleteMember,
  // Tests
  openAddTest, editTest, addParamRow, saveTest, deleteTest,
  filterTests, selectCategory, showTestDetail,
  loadTests, loadQuickParams,
  printTestReport, printFullReport,
  handleAttachmentChange, removeAttachment,
  // PDF import
  openImportOverlay, handleImportPDF, parseImportText,
  confirmImport, updateImportRef, removeImportRow,
  importedParams_update: updateImportParamField,
  // JSON import / export / CSV
  exportData, exportCsv, importData,
  // Notifications
  toggleNotifications,
});
