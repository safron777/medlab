// ══════════════════════════════════════════════════════
// NAVIGATION & OVERLAYS
// ══════════════════════════════════════════════════════
import { renderCharts } from './charts.js';

export function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');
  if (name === 'charts') renderCharts();
}

export function openOverlay(id) {
  document.getElementById(id).classList.add('open');
}

export function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
}

export function closeOverlayIfBg(e, id) {
  if (e.target.id === id) closeOverlay(id);
}

export function initNavigationListeners() {
  // Close member dropdown on outside click
  document.addEventListener('click', e => {
    const wrap = document.getElementById('member-switcher-wrap');
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('member-dropdown')?.classList.add('hidden');
    }
  });

  // Escape closes overlays and dropdowns
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('member-dropdown')?.classList.add('hidden');
      document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
    }
  });
}
