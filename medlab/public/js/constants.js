// ══════════════════════════════════════════════════════
// CONSTANTS & REFERENCE RANGES
// ══════════════════════════════════════════════════════
import { currentUser, tests } from './state.js';
import { calcAge } from './utils.js';

export const CATEGORIES = {
  blood:    { label: 'Кровь',    icon: '🩸' },
  urine:    { label: 'Моча',     icon: '🔬' },
  biochem:  { label: 'Биохимия', icon: '⚗️' },
  hormones: { label: 'Гормоны',  icon: '🧬' },
  vitamins: { label: 'Витамины', icon: '💊' },
  other:    { label: 'Прочее',   icon: '📋' },
};

export const COMMON_PARAMS = {
  blood: [
    { name: 'Гемоглобин',  unit: 'г/л',      refLow: 120, refHigh: 160 },
    { name: 'Эритроциты',  unit: '×10¹²/л',  refLow: 3.8, refHigh: 5.1 },
    { name: 'Лейкоциты',   unit: '×10⁹/л',   refLow: 4.0, refHigh: 9.0 },
    { name: 'Тромбоциты',  unit: '×10⁹/л',   refLow: 150, refHigh: 400 },
    { name: 'СОЭ',         unit: 'мм/ч',      refLow: 2,   refHigh: 15  },
    { name: 'Гематокрит',  unit: '%',         refLow: 36,  refHigh: 48  },
  ],
  biochem: [
    { name: 'Глюкоза',          unit: 'ммоль/л',  refLow: 3.9, refHigh: 6.1  },
    { name: 'Холестерин общий', unit: 'ммоль/л',  refLow: 0,   refHigh: 5.2  },
    { name: 'АЛТ',              unit: 'Ед/л',     refLow: 0,   refHigh: 40   },
    { name: 'АСТ',              unit: 'Ед/л',     refLow: 0,   refHigh: 40   },
    { name: 'Билирубин общий',  unit: 'мкмоль/л', refLow: 0,   refHigh: 20.5 },
    { name: 'Мочевина',         unit: 'ммоль/л',  refLow: 2.5, refHigh: 8.3  },
    { name: 'Креатинин',        unit: 'мкмоль/л', refLow: 44,  refHigh: 115  },
  ],
  hormones: [
    { name: 'ТТГ',         unit: 'мМЕ/л',    refLow: 0.4, refHigh: 4.0  },
    { name: 'Т4 свободный',unit: 'пмоль/л',  refLow: 9.0, refHigh: 22.0 },
    { name: 'Кортизол',    unit: 'нмоль/л',  refLow: 138, refHigh: 635  },
    { name: 'Инсулин',     unit: 'мкЕд/мл',  refLow: 2.0, refHigh: 25.0 },
  ],
  vitamins: [
    { name: 'Витамин D',        unit: 'нг/мл',  refLow: 30,  refHigh: 100 },
    { name: 'Витамин B12',      unit: 'пг/мл',  refLow: 187, refHigh: 883 },
    { name: 'Железо',           unit: 'мкмоль/л',refLow: 9.0, refHigh: 30.4},
    { name: 'Ферритин',         unit: 'нг/мл',  refLow: 10,  refHigh: 120 },
    { name: 'Фолиевая кислота', unit: 'нг/мл',  refLow: 3.1, refHigh: 17.5},
  ],
};

// ── Personalized reference ranges (sex/age-specific) ───────────────────────
export const SEX_AGE_REFS = {
  'Гемоглобин':        { male: [130, 170],   female: [120, 150] },
  'Эритроциты':        { male: [4.0, 5.5],   female: [3.7, 4.7] },
  'Гематокрит':        { male: [40, 50],     female: [36, 44]   },
  'Ферритин':          { male: [20, 300],    female: [10, 120]  },
  'Железо':            { male: [11.0, 28.0], female: [9.0, 27.0]},
  'Креатинин':         { male: [62, 115],    female: [44, 97]   },
  'СОЭ': {
    male:   (age) => age < 50 ? [1, 15]  : [1, 20],
    female: (age) => age < 50 ? [2, 20]  : [2, 30],
  },
  'АЛТ': { male: [7, 45],  female: [7, 35]  },
  'АСТ': { male: [10, 40], female: [10, 35] },
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
  'D-димер':           [0, 243],
  'Антитромбин III, % активности': [83, 128],
  'СРБ':               [0, 5.0],
  'СРБ высокочувствительный': [0, 1.0],
  'ПСА общий':         [0, 4.0],
  'Нейтрофилы, %':     [48, 78],
  'Нейтрофилы, абс.':  [1.78, 7.7],
  'Лимфоциты, %':      [19, 37],
  'Лимфоциты, абс.':   [1.0, 4.8],
  'Моноциты, %':       [3, 11],
  'Моноциты, абс.':    [0.05, 0.82],
  'Эозинофилы, %':     [1, 5],
  'Эозинофилы, абс.':  [0.02, 0.50],
  'Базофилы, %':       [0, 1],
  'Базофилы, абс.':    [0, 0.08],
  'MCV':               { male: [80, 99], female: [81, 100] },
  'MCH':               [27, 34],
  'МСHС':              [32, 36],
  'RDW':               [11.6, 14.8],
  'Ретикулоциты, ‰':   { male: [9.0, 22.2], female: [7.6, 22.1] },
  'Ретикулоциты, абс.': [23, 102],
  'АлАТ':              { male: [0, 41], female: [0, 31] },
  'ЛДГ':               [125, 220],
  'Билирубин непрямой': [0, 19.0],
  'Гаптоглобин':       { male: [14, 258], female: [35, 250] },
  'Гомоцистеин':       { male: [5.46, 16.2], female: [4.44, 13.56] },
  'Бета-2-микроглобулин': [0.97, 2.64],
  'Эритропоэтин':      [2.59, 18.5],
  'Активный витамин B12': [25, 165],
  'Гепсидин-25':       [1.49, 41.46],
};

// Returns { refLow, refHigh } for a parameter using user sex/age, or null
export function getPersonalizedRefs(paramName) {
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
export function getPrevValue(paramName, testDate) {
  for (const t of tests) {
    if (t.date < testDate) {
      const p = (t.parameters || []).find(p => p.name === paramName);
      if (p) return parseFloat(p.value);
    }
  }
  return null;
}

// Returns HTML trend indicator vs previous measurement
export function renderTrend(paramName, currentValue, testDate) {
  const prev = getPrevValue(paramName, testDate);
  if (prev === null || prev === 0) return '';
  const curr = parseFloat(currentValue);
  const diffPct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(diffPct) < 5) return `<span style="color:var(--text-3);font-size:9px;margin-left:3px">→</span>`;
  const dir = diffPct > 0 ? '↑' : '↓';
  return `<span style="color:var(--text-2);font-size:9px;margin-left:3px">${dir}${Math.abs(Math.round(diffPct))}%</span>`;
}

export function getTestStatus(test) {
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
  if (maxDevPct === 0) return 'normal';
  if (maxDevPct <= 20) return 'mild';
  if (maxDevPct <= 50) return 'moderate';
  return 'danger';
}

export function getLatestParamValue(paramName) {
  for (const t of tests) {
    const p = (t.parameters || []).find(p => p.name === paramName);
    if (p) return { value: parseFloat(p.value), date: t.date };
  }
  return null;
}

export function computeCalculatedIndicators() {
  const results = [];

  // 1. eGFR (CKD-EPI 2021)
  const creatinine = getLatestParamValue('Креатинин');
  if (creatinine && currentUser?.birthDate && currentUser?.sex) {
    const age      = calcAge(currentUser.birthDate);
    const isFemale = currentUser.sex === 'female';
    const scrMgdl  = creatinine.value / 88.4;
    const kappa    = isFemale ? 0.7   : 0.9;
    const alpha    = isFemale ? -0.241 : -0.302;
    const sexFactor = isFemale ? 1.012 : 1.0;
    const ratio    = scrMgdl / kappa;
    const egfr     = Math.round(142 * Math.pow(Math.min(ratio, 1), alpha) *
                     Math.pow(Math.max(ratio, 1), -1.200) * Math.pow(0.9938, age) * sexFactor);
    const [status, label] =
      egfr >= 90 ? ['normal',   'G1 — Норма (≥90)']             :
      egfr >= 60 ? ['mild',     'G2 — Незначительное снижение'] :
      egfr >= 45 ? ['moderate', 'G3a — Умеренное снижение']     :
      egfr >= 30 ? ['danger',   'G3b — Значительное снижение']  :
                   ['danger',   'G4-5 — Тяжёлая ХБП (<30)'];
    results.push({ name: 'СКФ (eGFR)', value: egfr, unit: 'мл/мин/1.73м²', status, label, date: creatinine.date });
  }

  // 2. HOMA-IR
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

  // 3. Atherogenicity coefficient
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
