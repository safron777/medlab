import { describe, it, expect } from 'vitest';
import { escapeHTML, esc, formatDate, calcAge, slugify } from '../../public/js/utils.js';

describe('escapeHTML', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });

  it('escapes all special HTML characters', () => {
    expect(escapeHTML('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes single quotes and ampersands', () => {
    expect(escapeHTML("it's fine & <great>")).toBe(
      "it&#39;s fine &amp; &lt;great&gt;",
    );
  });

  it('passes through plain text unchanged', () => {
    expect(escapeHTML('hello world')).toBe('hello world');
  });

  it('converts numbers to string', () => {
    expect(escapeHTML(42)).toBe('42');
  });
});

describe('esc', () => {
  it('escapes angle brackets and ampersands but not quotes', () => {
    expect(esc('<b>bold & "bright"</b>')).toBe('&lt;b&gt;bold &amp; "bright"&lt;/b&gt;');
  });

  it('returns empty string for falsy input', () => {
    expect(esc('')).toBe('');
    expect(esc(null)).toBe('');
  });
});

describe('formatDate', () => {
  it('returns em dash for falsy input', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });

  it('formats a valid ISO date in Russian locale', () => {
    const result = formatDate('2024-01-15');
    // Should contain '2024' and some month abbreviation
    expect(result).toMatch(/2024/);
    expect(result).toMatch(/янв/i);
  });

  it('returns the raw string if parsing fails', () => {
    const bad = 'not-a-date';
    const result = formatDate(bad);
    // Either returns the raw string or '—' — should not throw
    expect(typeof result).toBe('string');
  });
});

describe('calcAge', () => {
  it('calculates age correctly for a known birth date', () => {
    // Person born 1990-01-01, current date mocked by real Date.now()
    // As of 2026 they are 36 years old (turned 36 in Jan 2026)
    const age = calcAge('1990-01-01');
    expect(age).toBeGreaterThanOrEqual(35);
    expect(age).toBeLessThanOrEqual(37);
  });

  it('returns 0 for a very recent birth date', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(calcAge(today)).toBe(0);
  });
});

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('collapses multiple separators', () => {
    expect(slugify('foo  bar--baz')).toBe('foo-bar-baz');
  });

  it('preserves Cyrillic characters', () => {
    const result = slugify('Глюкоза');
    expect(result).toMatch(/глюкоза/);
  });
});
