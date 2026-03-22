import { describe, it, expect, vi } from 'vitest';

// Mock all browser-dependent imports of pdf-import.js
vi.mock('../../public/js/state.js', () => ({
  currentMemberId: null,
  currentUser: null,
}));
vi.mock('../../public/js/api.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../../public/js/utils.js', () => ({
  escapeHTML: (s) => String(s ?? ''),
  toast: vi.fn(),
  todayStr: vi.fn(() => '2026-01-01'),
}));
vi.mock('../../public/js/constants.js', () => ({
  getPersonalizedRefs: () => null,
}));
vi.mock('../../public/js/navigation.js', () => ({
  openOverlay: vi.fn(),
  closeOverlay: vi.fn(),
}));

import { parseLabText } from '../../public/js/pdf-import.js';

describe('parseLabText', () => {
  describe('tab-separated format (Инвитро)', () => {
    it('parses name, value, unit, ref range from tab columns', () => {
      const text = 'Глюкоза\t5.2\tммоль/л\t3.9-6.1';
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'Глюкоза',
        value: '5.2',
        unit: 'ммоль/л',
        refLow: 3.9,
        refHigh: 6.1,
      });
    });

    it('parses tab format without ref range', () => {
      const text = 'Гемоглобин\t145\tг/л';
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Гемоглобин');
      expect(result[0].value).toBe('145');
    });

    it('parses comma as decimal separator', () => {
      const text = 'АЛТ\t25,3\tЕд/л\t0-45';
      const result = parseLabText(text);
      expect(result[0].value).toBe('25.3');
    });
  });

  describe('space-separated format (Дентал Фэмили)', () => {
    it('parses 5-column format with duplicate value and date', () => {
      const text = 'Гемоглобин 16.3 16.2 04.02.26 г/дл 13.1 - 17.2';
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Гемоглобин');
      expect(result[0].value).toBe('16.3');
      expect(result[0].refLow).toBe(13.1);
      expect(result[0].refHigh).toBe(17.2);
    });

    it('parses double-space format', () => {
      const text = 'Лейкоциты  6.5  тыс/мкл  4.5 - 11';
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Лейкоциты');
      expect(result[0].value).toBe('6.5');
    });
  });

  describe('ref range parsing', () => {
    it('parses hyphen-separated range', () => {
      const text = 'Глюкоза\t5.0\tммоль/л\t3.9-6.1';
      const [r] = parseLabText(text);
      expect(r.refLow).toBe(3.9);
      expect(r.refHigh).toBe(6.1);
    });

    it('parses < upper-only range', () => {
      const text = 'D-димер\t26\tнг/мл\t< 243';
      const [r] = parseLabText(text);
      expect(r.refLow).toBe('');
      expect(r.refHigh).toBe(243);
    });

    it('parses en-dash range', () => {
      const text = 'Фибриноген\t3.2\tг/л\t2 – 4';
      const [r] = parseLabText(text);
      expect(r.refLow).toBe(2);
      expect(r.refHigh).toBe(4);
    });
  });

  describe('deduplication', () => {
    it('returns only the first occurrence of a duplicate parameter name', () => {
      const text = [
        'Глюкоза\t5.2\tммоль/л\t3.9-6.1',
        'Глюкоза\t5.5\tммоль/л\t3.9-6.1',
      ].join('\n');
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('5.2');
    });
  });

  describe('skip words / noise filtering', () => {
    it('skips lines starting with reserved words', () => {
      const text = [
        'Дата: 15.01.2026',
        'Пациент: Иванов И.И.',
        'Врач: Петров П.П.',
        'Глюкоза\t5.2\tммоль/л\t3.9-6.1',
      ].join('\n');
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Глюкоза');
    });

    it('skips pure-numeric lines', () => {
      const text = ['12345', 'Глюкоза\t5.2\tммоль/л\t3.9-6.1'].join('\n');
      const result = parseLabText(text);
      expect(result).toHaveLength(1);
    });
  });

  describe('cleanParamName', () => {
    it('strips parenthetical suffixes', () => {
      const text = '% низкофлуоресцирующих ретикулоцитов (LFR)  88.5  %  86.2 - 97.6';
      const [r] = parseLabText(text);
      expect(r.name).not.toMatch(/\(/);
    });

    it('strips asterisk from value', () => {
      const text = 'Эритроциты 5.69* 5.66* 04.02.26 млн/мкл 4.2 - 5.6';
      const [r] = parseLabText(text);
      expect(r.value).toBe('5.69');
    });
  });

  describe('real-world case — Инвитро биохимия', () => {
    const text = `
Фибриноген 3.2 г/л 2 - 4
D-димер 26 нг/мл < 243
АлАТ 26 Ед/л < 41
Билирубин общий 14.4 мкмоль/л 3.4 - 20.5
Гомоцистеин 7.60 мкмоль/л 5.46 - 16.2
`.trim();

    it('recognises at least 4 of 5 parameters', () => {
      const names = parseLabText(text).map((r) => r.name);
      const expected = ['Фибриноген', 'D-димер', 'АлАТ', 'Билирубин общий', 'Гомоцистеин'];
      const found = expected.filter((e) => names.some((n) => n === e || n.startsWith(e)));
      expect(found.length).toBeGreaterThanOrEqual(4);
    });
  });
});
