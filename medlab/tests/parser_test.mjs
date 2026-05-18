/**
 * Юнит-тест parseLabText против реальных текстов из PDF
 * node tests/parser_test.mjs
 */

// ── заглушки браузерного окружения ───────────────────────────────────────────
const currentUser = { sex: 'male', birthDate: '1978-08-25' };

const SEX_AGE_REFS = {
  'Гемоглобин': { male: [130, 173], female: [120, 160] },
  'Эритроциты': { male: [4.2, 5.6], female: [3.8, 5.1] },
  'Лейкоциты':  [4.5, 11],
  'Тромбоциты': [150, 400],
  'Фибриноген': [2.0, 4.0],
};

function getPersonalizedRefs(paramName) {
  const entry = SEX_AGE_REFS[paramName];
  if (!entry) return null;
  if (Array.isArray(entry)) return { refLow: entry[0], refHigh: entry[1] };
  const sex = currentUser?.sex || 'male';
  const sexEntry = entry[sex] || entry['male'];
  if (!sexEntry) return null;
  return { refLow: sexEntry[0], refHigh: sexEntry[1] };
}

// ── сама функция (скопирована из app.js) ─────────────────────────────────────
function cleanParamName(raw) {
  return raw
    .replace(/\s*\([^)]+\)/g, '')
    .replace(/[↑↓▲▼!*№#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseLabText(rawText) {
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

  const lines = rawText.split(/\n/).map(l => l.trim()).filter(l => l.length > 3);
  const results = [];

  for (const line of lines) {
    if (skipWords.test(line)) continue;
    if (line.length < 5 || line.length > 350) continue;
    if (/^\d[\d\s/\-.,:]+$/.test(line)) continue;

    for (const [re, ni, vi, ui, ri] of patterns) {
      const m = line.match(re);
      if (!m) continue;

      const pName = cleanParamName(m[ni]);
      if (!pName || pName.length < 2) break;

      const unitStr = m[ui].replace(/[↑↓▲▼!*]/g, '').trim();
      if (/^\d{2}\.\d{2}\.\d{2}$/.test(unitStr) || /^[\d.,]+$/.test(unitStr)) break;

      const val = m[vi].replace('*', '').replace(',', '.');
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

// ── тестовые данные ───────────────────────────────────────────────────────────

const cases = [

  {
    label: 'МАРТ 2026 — Инвитро (коагулограмма + биохимия)',
    expected: ['Фибриноген','D-димер','АлАТ','Билирубин общий','Билирубин прямой',
               'Билирубин непрямой','ЛДГ','Мочевая кислота','Гаптоглобин',
               'Железо','Ферритин','Гомоцистеин','Бета-2-микроглобулин',
               'Эритропоэтин','Активный витамин B12','Гепсидин-25'],
    text: `
Фибриноген 3.2 г/л 2 - 4
D-димер 26 нг/мл < 243
АлАТ 26 Ед/л < 41
Билирубин общий 14.4 мкмоль/л 3.4 - 20.5
Билирубин прямой 4.8 мкмоль/л <8.6
Билирубин непрямой 9.6 мкмоль/л <19.0
ЛДГ 153 Ед/л 125 - 220
Мочевая кислота 334 мкмоль/л 210 - 420
СРБ высокочувствительный (кардиориск) 0.1 мг/л см.комм
Гаптоглобин 116 мг/дл 14 - 258
Железо 25.9 мкмоль/л 11.6 - 31.3
Ферритин 263 мкг/л 22 - 275
Гомоцистеин 7.60 мкмоль/л 5.46 - 16.2
Бета-2-микроглобулин 1.45 мг/л 0.97 - 2.64
Эритропоэтин 9.5 мМЕ/мл 2.59 - 18.5
Активный витамин B12 157 пмоль/л 25 - 165
Гепсидин-25 4.95 нг/мл 1.49 - 41.46
`.trim(),
  },

  {
    label: 'Дентал Фэмили — ОАК (5 колонок: Имя, Знач, Предыд, Дата, Ед, Ref)',
    expected: ['Гематокрит','Гемоглобин','Эритроциты','MCV','RDW',
               'MCH','МСHС','Тромбоциты','Лейкоциты',
               'Нейтрофилы, %','Лимфоциты, %','Моноциты, %',
               'Эозинофилы, %','Базофилы, %',
               'Нейтрофилы, абс.','Лимфоциты, абс.','Моноциты, абс.',
               'Эозинофилы, абс.','Базофилы, абс.','СОЭ','Ретикулоциты'],
    text: `
Гематокрит 47.7 48.6 04.02.26 % 39 - 50
Гемоглобин 16.3 16.2 04.02.26 г/дл 13.1 - 17.2
Эритроциты 5.69* 5.66* 04.02.26 млн/мкл 4.2 - 5.6
MCV (ср. объем эритр.) 83.8 85.9 04.02.26 фл 81 - 101
RDW (шир. распред. эритр) 12.3 12.2 04.02.26 % 11.6 - 14.8
MCH (ср. содер. Hb в эр.) 28.6 28.6 04.02.26 пг 27 - 35
МСHС (ср. конц. Hb в эр.) 34.2 33.3 04.02.26 г/дл 32 - 36
Тромбоциты 277 300 04.02.26 тыс/мкл 150 - 400
Лейкоциты 6.49 6.48 04.02.26 тыс/мкл 4.5 - 11
Нейтрофилы (общ.число), % 50.2 59 04.02.26 % 48 - 78
Лимфоциты, % 36.7 31 04.02.26 % 19 - 37
Моноциты, % 10.2 8 04.02.26 % 3 - 11
Эозинофилы, % 2 2 04.02.26 % 1 - 5
Базофилы, % 0.9 0 04.02.26 % < 1.0
Нейтрофилы, абс. 3.26 3.82 04.02.26 тыс/мкл 1.78 - 5.38
Лимфоциты, абс. 2.38 2.01 04.02.26 тыс/мкл 1.32 - 3.57
Моноциты, абс. 0.66 0.52 04.02.26 тыс/мкл 0.2 - 0.95
Эозинофилы, абс. 0.13 0.13 04.02.26 тыс/мкл < 0.7
Базофилы, абс. 0.06 0.00 04.02.26 тыс/мкл < 0.2
СОЭ 3 3 04.02.26 мм/ч < 15
Ретикулоциты 17.0 ‰ 9 - 22.2
`.trim(),
  },

  {
    label: 'Дентал Фэмили — Ретикулоцитарная панель (4 колонки)',
    expected: ['Ретикулоциты, ‰','Ретикулоциты, абс.',
               '% низкофлуоресцирующих ретикулоцитов',
               '% среднефлуоресцирующих ретикулоцитов',
               '% высокофлуоресцирующих ретикулоцитов',
               'Доля незрелых ретикулоцитов',
               'Содержание HB в ретикулоците',
               'Процент гипохромных эритроцитов %',
               'Разница среднего содержания гемоглобина в ретикулоцитах и эритроцитах'],
    // после cleanParamName скобки убираются:
    // "% низкофлуоресцирующих ретикулоцитов (более зрелые) (LFR)" → "% низкофлуоресцирующих ретикулоцитов"
    text: `
Ретикулоциты, ‰ 17.0 ‰ 6.8 - 18.6
Ретикулоциты, абс. 96.7 10^9/л 34 - 102
% низкофлуоресцирующих ретикулоцитов (более зрелые) (LFR) 88.5 % 86.2 - 97.6
% среднефлуоресцирующих ретикулоцитов (незрелые) (MFR) 10.1 % 2.5 - 11.9
% высокофлуоресцирующих ретикулоцитов (незрелые) (HFR) 1.4 % < 2.3
Доля незрелых ретикулоцитов (IRF) 11.5 % 2.7 - 13.8
Содержание HB в ретикулоците (RET-He) 32.5 пг 29.3 - 35.4
Процент гипохромных эритроцитов % (Hypo-He) 0.1 % < 0.4
Разница среднего содержания гемоглобина в ретикулоцитах и эритроцитах 3.1 пг 1.2 - 3.6
`.trim(),
  },

  {
    label: 'Дентал Фэмили — Антитромбин III',
    expected: ['Антитромбин III, % активности'],
    text: `Антитромбин III, % активности 110 % 83 - 128`,
  },

];

// ── запуск тестов ─────────────────────────────────────────────────────────────
let totalPass = 0, totalFail = 0;

for (const { label, text, expected } of cases) {
  console.log(`\n━━ ${label}`);
  const parsed = parseLabText(text);
  const parsedNames = parsed.map(p => p.name);

  // найденные
  console.log(`  Найдено ${parsed.length} показателей:`);
  for (const p of parsed) {
    const ok = expected.some(e => p.name.startsWith(e) || e.startsWith(p.name));
    console.log(`  ${ok ? '✓' : '?'} ${p.name.padEnd(55)} ${String(p.value).padStart(8)}  ${p.unit.padEnd(12)} [${p.refLow}–${p.refHigh}]`);
  }

  // пропущенные
  const missed = expected.filter(e => !parsedNames.some(n => n.startsWith(e) || e.startsWith(n)));
  if (missed.length) {
    console.log(`  ПРОПУЩЕНО (${missed.length}):`);
    for (const m of missed) {
      console.log(`  ✗ ${m}`);
      totalFail++;
    }
  } else {
    console.log(`  Все ожидаемые найдены`);
    totalPass++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Итого: тестов ${cases.length}, пропущенных показателей: ${totalFail}`);
