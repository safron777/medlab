// ══════════════════════════════════════════════════════
// PDF IMPORT
// ══════════════════════════════════════════════════════
import { currentMemberId } from './state.js';
import { apiFetch } from './api.js';
import { escapeHTML, toast, todayStr } from './utils.js';
import { getPersonalizedRefs } from './constants.js';
import { openOverlay, closeOverlay } from './navigation.js';

let importedParams = [];

export function openImportOverlay() {
  resetImport();
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  openOverlay('import-overlay');
}

export function resetImport() {
  importedParams = [];
  document.getElementById('import-step-1')?.classList.remove('hidden');
  document.getElementById('import-step-2')?.classList.add('hidden');
  const inp  = document.getElementById('import-pdf-input');
  if (inp) inp.value = '';
  const txt  = document.getElementById('import-text-input');
  if (txt) txt.value = '';
  const zone = document.getElementById('import-drop-zone');
  if (zone) zone.classList.remove('drag-over');
}

export async function handleImportPDF(input) {
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
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items   = content.items.sort((a, b) =>
        Math.round(b.transform[5] / 5) * 5 - Math.round(a.transform[5] / 5) * 5 ||
        a.transform[4] - b.transform[4]
      );
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
    const labMatch = fullText.match(/инвитро|invitro|гемотест|gemotest|helix|хеликс|ситилаб|citilab/i);
    if (labMatch) {
      document.getElementById('import-test-lab').value =
        labMatch[0].charAt(0).toUpperCase() + labMatch[0].slice(1).toLowerCase();
    }
    parseImportText();
  } catch (e) {
    toast('Ошибка чтения PDF: ' + e.message, 'error');
    btn.classList.remove('drag-over');
  }
}

export function parseLabText(rawText) {
  const toNum = s => parseFloat((s || '').replace(',', '.')) || '';

  function parseRef(s) {
    s = (s || '').trim();
    const range = s.match(/([\d.,]+)\s*[-–—]\s*([\d.,]+)/);
    if (range) return [toNum(range[1]), toNum(range[2])];
    const lt = s.match(/^[<≤]\s*([\d.,]+)/);
    if (lt) return ['', toNum(lt[1])];
    const gt = s.match(/^[>≥]\s*([\d.,]+)/);
    if (gt) return [toNum(gt[1]), ''];
    return ['', ''];
  }

  const numVal = '[\\d][.,\\d]*[*]?';
  const dateP  = '\\d{2}\\.\\d{2}\\.\\d{2,4}';
  const unitP  = '\\S{1,15}';
  const nameP  = '([А-ЯЁа-яёA-Za-z%‰][А-ЯЁа-яёA-Za-z0-9 %‰/,()\\[\\].\\-]{1,85}?)';

  const patterns = [
    [new RegExp(`^${nameP}\\t(${numVal})\\t(${unitP})\\t(.+)$`),           1,2,3,4],
    [new RegExp(`^${nameP}\\t(${numVal})\\t(${unitP})\\s*$`),              1,2,3,null],
    [new RegExp(`^${nameP}\\s+(${numVal})\\s+${numVal}\\s+${dateP}\\s+(${unitP})\\s+(.+)$`), 1,2,3,4],
    [new RegExp(`^${nameP}\\s+(${numVal})\\s+${numVal}\\s+${dateP}\\s+(${unitP})\\s*$`),     1,2,3,null],
    [new RegExp(`^${nameP}\\s{2,}(${numVal})\\s+(${unitP})\\s+(.+)$`),    1,2,3,4],
    [new RegExp(`^${nameP}\\s{2,}(${numVal})\\s+(${unitP})\\s*$`),        1,2,3,null],
    [new RegExp(`^${nameP}\\s*\\|\\s*(${numVal})\\s*\\|\\s*(${unitP})\\s*\\|\\s*(.+)$`), 1,2,3,4],
    [new RegExp(`^${nameP}\\s+(${numVal})\\s+(${unitP})\\s+(.+)$`), 1,2,3,4],
    [new RegExp(`^${nameP}\\s+(${numVal})\\s+(${unitP})\\s*$`),     1,2,3,null],
  ];

  const skipWords = /^(дата|время|пациент|врач|номер|бланк|страниц|единиц|референс|анализ|исследование|материал|статус|готов|заказ|лаборатор|пол:|возраст|телефон|адрес|www|http|©|итого|выдан|подпись|продолжение|исполнитель|комментар|название|внимание|результаты исследований|динамику|перейти|стр\.)/i;
  const addressPat = /[,]\s*(ул\.|пр-т|пр\.|д\.|кв\.|г\.|обл\.|пер\.|пл\.|корп\.|стр\.)/i;

  const lines   = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
  const results = [];

  for (const line of lines) {
    if (skipWords.test(line)) continue;
    if (addressPat.test(line)) continue;
    if (line.length < 5 || line.length > 350) continue;
    if (/^\d[\d\s/\-.,:]+$/.test(line)) continue;

    for (const [re, ni, vi, ui, ri] of patterns) {
      const m = line.match(re);
      if (!m) continue;
      const pName = cleanParamName(m[ni]);
      if (!pName || pName.length < 2) break;
      const unitStr = m[ui].replace(/[↑↓▲▼!*]/g, '').trim();
      if (/^\d{2}\.\d{2}\.\d{2}$/.test(unitStr) || /^[\d.,]+$/.test(unitStr)) break;
      const val    = m[vi].replace('*', '').replace(',', '.');
      const refStr = ri ? m[ri] : '';
      const [rLow, rHigh] = parseRef(refStr);
      const personal = getPersonalizedRefs(pName);
      results.push({
        name:    pName,
        value:   val,
        unit:    unitStr,
        refLow:  rLow  !== '' ? rLow  : (personal?.refLow  || ''),
        refHigh: rHigh !== '' ? rHigh : (personal?.refHigh || ''),
      });
      break;
    }
  }

  const seen = new Set();
  return results.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });
}

function cleanParamName(raw) {
  return raw
    .replace(/\s*\([^)]+\)/g, '')
    .replace(/[↑↓▲▼!*№#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function parseImportText() {
  const text = document.getElementById('import-text-input').value;
  if (!text.trim()) { toast('Нет текста для анализа', 'error'); return; }
  importedParams = parseLabText(text);
  if (!importedParams.length) {
    toast('Не удалось распознать показатели. Попробуйте скопировать текст вручную.', 'error');
    return;
  }
  const dateRe = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/g;
  let dateMatch, foundDate = null;
  while ((dateMatch = dateRe.exec(text)) !== null) {
    const year = parseInt(dateMatch[3], 10);
    if (year >= 2000) { foundDate = dateMatch; break; }
  }
  if (foundDate) {
    document.getElementById('import-test-date').value = `${foundDate[3]}-${foundDate[2]}-${foundDate[1]}`;
  } else {
    document.getElementById('import-test-date').value = todayStr();
  }
  renderImportPreview();
  document.getElementById('import-step-1').classList.add('hidden');
  document.getElementById('import-step-2').classList.remove('hidden');
}

export function renderImportPreview() {
  const tbody = document.getElementById('import-preview-body');
  tbody.innerHTML = importedParams.map((p, i) => `<tr>
    <td><input value="${escapeHTML(p.name)}" id="ip-name-${i}" onchange="importedParams_update(${i},'name',this.value)"></td>
    <td><input value="${escapeHTML(p.value)}" id="ip-val-${i}" style="width:60px" onchange="importedParams_update(${i},'value',this.value)"></td>
    <td><input value="${escapeHTML(p.unit)}" id="ip-unit-${i}" style="width:60px" onchange="importedParams_update(${i},'unit',this.value)"></td>
    <td><input value="${p.refLow !== '' ? p.refLow : ''}–${p.refHigh !== '' ? p.refHigh : ''}" id="ip-ref-${i}" style="width:80px" onchange="updateImportRef(${i},this.value)"></td>
    <td><button class="btn btn-ghost btn-icon btn-sm" onclick="removeImportRow(${i})" style="padding:2px 6px;font-size:11px">✕</button></td>
  </tr>`).join('');
}

// Called from inline handler exposed on window
export function updateImportParamField(i, field, val) {
  if (importedParams[i]) importedParams[i][field] = val;
}

export function updateImportRef(i, val) {
  const parts = val.split('–').map(s => s.trim());
  importedParams[i].refLow  = parts[0] || '';
  importedParams[i].refHigh = parts[1] || '';
}

export function removeImportRow(i) {
  importedParams.splice(i, 1);
  renderImportPreview();
}

export async function confirmImport() {
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
    await apiFetch('/api/tests', 'POST', payload);
    closeOverlay('import-overlay');
    const { loadTests } = await import('./tests.js');
    await loadTests(1);
    toast(`Импортировано ${parameters.length} показателей ✓`, 'success');
  } catch (e) {
    toast(e.message || 'Ошибка сохранения', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Сохранить анализ';
  }
}
