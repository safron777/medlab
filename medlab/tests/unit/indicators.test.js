import { describe, it, expect, beforeEach } from 'vitest';
import { setTests, setCurrentUser } from '../../public/js/state.js';
import { computeCalculatedIndicators } from '../../public/js/constants.js';

// Helper: wrap a value into the tests array structure that getLatestParamValue expects
function makeTest(params) {
  return [{ date: '2026-01-01', parameters: params }];
}

beforeEach(() => {
  setTests([]);
  setCurrentUser(null);
});

describe('computeCalculatedIndicators', () => {
  describe('HOMA-IR', () => {
    it('returns normal status when HOMA < 2.7', () => {
      // glucose=5.0, insulin=10.0 → HOMA = (5.0 * 10.0) / 22.5 ≈ 2.22
      setTests(makeTest([
        { name: 'Глюкоза', value: '5.0' },
        { name: 'Инсулин', value: '10.0' },
      ]));
      const results = computeCalculatedIndicators();
      const homa = results.find((r) => r.name === 'HOMA-IR');
      expect(homa).toBeDefined();
      expect(homa.status).toBe('normal');
      expect(parseFloat(homa.value)).toBeCloseTo(2.22, 1);
    });

    it('returns moderate status when HOMA is 2.7–4.0', () => {
      // glucose=5.0, insulin=14.0 → HOMA = (5.0 * 14.0) / 22.5 ≈ 3.11
      setTests(makeTest([
        { name: 'Глюкоза', value: '5.0' },
        { name: 'Инсулин', value: '14.0' },
      ]));
      const results = computeCalculatedIndicators();
      const homa = results.find((r) => r.name === 'HOMA-IR');
      expect(homa.status).toBe('moderate');
    });

    it('returns danger status when HOMA >= 4.0', () => {
      // glucose=6.0, insulin=20.0 → HOMA = (6.0 * 20.0) / 22.5 ≈ 5.33
      setTests(makeTest([
        { name: 'Глюкоза', value: '6.0' },
        { name: 'Инсулин', value: '20.0' },
      ]));
      const results = computeCalculatedIndicators();
      const homa = results.find((r) => r.name === 'HOMA-IR');
      expect(homa.status).toBe('danger');
    });

    it('also accepts "Глюкоза нат." as glucose source', () => {
      setTests(makeTest([
        { name: 'Глюкоза нат.', value: '5.0' },
        { name: 'Инсулин', value: '10.0' },
      ]));
      const results = computeCalculatedIndicators();
      expect(results.find((r) => r.name === 'HOMA-IR')).toBeDefined();
    });

    it('is absent when glucose or insulin is missing', () => {
      setTests(makeTest([{ name: 'Глюкоза', value: '5.0' }]));
      const results = computeCalculatedIndicators();
      expect(results.find((r) => r.name === 'HOMA-IR')).toBeUndefined();
    });
  });

  describe('Atherogenicity coefficient (Коэф. атерогенности)', () => {
    it('returns normal when KA < 2.5', () => {
      // chol=4.5, hdl=2.0 → KA = (4.5 - 2.0) / 2.0 = 1.25
      setTests(makeTest([
        { name: 'Холестерин общий', value: '4.5' },
        { name: 'ЛПВП', value: '2.0' },
      ]));
      const results = computeCalculatedIndicators();
      const ka = results.find((r) => r.name === 'Коэф. атерогенности');
      expect(ka).toBeDefined();
      expect(ka.status).toBe('normal');
    });

    it('returns mild when KA is 2.5–3.0', () => {
      // chol=5.5, hdl=1.5 → KA = (5.5 - 1.5) / 1.5 ≈ 2.67
      setTests(makeTest([
        { name: 'Холестерин общий', value: '5.5' },
        { name: 'ЛПВП', value: '1.5' },
      ]));
      const results = computeCalculatedIndicators();
      const ka = results.find((r) => r.name === 'Коэф. атерогенности');
      expect(ka.status).toBe('mild');
    });

    it('returns moderate when KA is 3.0–4.0', () => {
      // chol=6.0, hdl=1.5 → KA = (6.0 - 1.5) / 1.5 = 3.0
      setTests(makeTest([
        { name: 'Холестерин общий', value: '6.0' },
        { name: 'ЛПВП', value: '1.5' },
      ]));
      const results = computeCalculatedIndicators();
      const ka = results.find((r) => r.name === 'Коэф. атерогенности');
      expect(ka.status).toBe('moderate');
    });

    it('returns danger when KA > 4.0', () => {
      // chol=7.5, hdl=1.2 → KA = (7.5 - 1.2) / 1.2 = 5.25
      setTests(makeTest([
        { name: 'Холестерин общий', value: '7.5' },
        { name: 'ЛПВП', value: '1.2' },
      ]));
      const results = computeCalculatedIndicators();
      const ka = results.find((r) => r.name === 'Коэф. атерогенности');
      expect(ka.status).toBe('danger');
    });

    it('is absent when HDL is zero (division guard)', () => {
      setTests(makeTest([
        { name: 'Холестерин общий', value: '5.0' },
        { name: 'ЛПВП', value: '0' },
      ]));
      const results = computeCalculatedIndicators();
      expect(results.find((r) => r.name === 'Коэф. атерогенности')).toBeUndefined();
    });
  });

  describe('eGFR (СКФ)', () => {
    it('returns normal (G1) for healthy creatinine in a 35-year-old male', () => {
      // creatinine 88.4 µmol/L = 1.0 mg/dL → eGFR ≈ 99–102
      setCurrentUser({ sex: 'male', birthDate: '1991-01-01' });
      setTests(makeTest([{ name: 'Креатинин', value: '88.4' }]));
      const results = computeCalculatedIndicators();
      const egfr = results.find((r) => r.name === 'СКФ (eGFR)');
      expect(egfr).toBeDefined();
      expect(egfr.status).toBe('normal');
      expect(egfr.value).toBeGreaterThanOrEqual(90);
    });

    it('returns mild (G2) when eGFR is 60–89', () => {
      // creatinine 100 µmol/L (= 1.131 mg/dL) in 50-year-old male → eGFR ≈ 79
      setCurrentUser({ sex: 'male', birthDate: '1976-01-01' });
      setTests(makeTest([{ name: 'Креатинин', value: '100' }]));
      const results = computeCalculatedIndicators();
      const egfr = results.find((r) => r.name === 'СКФ (eGFR)');
      expect(egfr).toBeDefined();
      expect(egfr.value).toBeGreaterThanOrEqual(60);
      expect(egfr.value).toBeLessThan(90);
    });

    it('is absent when birthDate or sex is missing', () => {
      setCurrentUser({ sex: 'male' }); // no birthDate
      setTests(makeTest([{ name: 'Креатинин', value: '88.4' }]));
      const results = computeCalculatedIndicators();
      expect(results.find((r) => r.name === 'СКФ (eGFR)')).toBeUndefined();
    });

    it('returns empty array when tests array is empty', () => {
      setCurrentUser({ sex: 'male', birthDate: '1991-01-01' });
      setTests([]);
      const results = computeCalculatedIndicators();
      expect(results).toHaveLength(0);
    });
  });
});
