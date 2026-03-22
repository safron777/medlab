/* global Chart */
// ══════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════
import { tests, charts } from './state.js';
import { formatDate, slugify } from './utils.js';

export function renderCharts() {
  const container = document.getElementById('charts-container');
  const paramMap = {};
  for (const test of tests) {
    for (const p of (test.parameters || [])) {
      if (!paramMap[p.name]) paramMap[p.name] = [];
      paramMap[p.name].push({
        date: test.date,
        value: parseFloat(p.value),
        unit: p.unit,
        refLow: parseFloat(p.refLow) || null,
        refHigh: parseFloat(p.refHigh) || null,
      });
    }
  }

  const trackable = Object.entries(paramMap)
    .filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  if (!trackable.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-title">Нет данных для графиков</div><p>Добавьте минимум 2 анализа с одинаковыми показателями для отображения динамики</p></div>`;
    return;
  }

  container.innerHTML = trackable.map(([name]) =>
    `<div class="chart-container"><div class="chart-header"><div><div class="chart-title">${name}</div></div></div><canvas id="chart-${slugify(name)}" height="160"></canvas></div>`
  ).join('');

  for (const [name, points] of trackable) {
    const sorted   = points.sort((a, b) => new Date(a.date) - new Date(b.date));
    const ctx      = document.getElementById('chart-' + slugify(name))?.getContext('2d');
    if (!ctx) continue;

    const refLow  = sorted[0].refLow;
    const refHigh = sorted[0].refHigh;
    const colors  = sorted.map(p => {
      if (refHigh && p.value > refHigh) return '#EF4444';
      if (refLow  && p.value < refLow)  return '#F59E0B';
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
    charts[name] = new window.Chart(ctx, {
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
            callbacks: { label: ctx => `${ctx.parsed.y} ${sorted[0].unit}` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A80', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A80', font: { size: 11 } } },
        },
      },
    });
  }
}
