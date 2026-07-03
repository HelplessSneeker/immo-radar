import { describe, expect, it } from 'vitest';
import { heutigesDatum, tageZwischen } from '../src/datum.js';

describe('heutigesDatum', () => {
  it('liefert ein YYYY-MM-DD-Datum', () => {
    expect(heutigesDatum()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('tageZwischen', () => {
  it('zählt ganze Tage von "von" bis "bis"', () => {
    expect(tageZwischen('2026-07-01', '2026-07-01')).toBe(0);
    expect(tageZwischen('2026-07-01', '2026-07-08')).toBe(7);
    expect(tageZwischen('2026-06-28', '2026-07-02')).toBe(4);
  });

  it('ist negativ bei vertauschter Reihenfolge', () => {
    expect(tageZwischen('2026-07-08', '2026-07-01')).toBe(-7);
  });

  it('kommt über Monats- und Jahresgrenzen', () => {
    expect(tageZwischen('2025-12-31', '2026-01-01')).toBe(1);
    expect(tageZwischen('2026-02-28', '2026-03-01')).toBe(1); // 2026 kein Schaltjahr
  });
});
