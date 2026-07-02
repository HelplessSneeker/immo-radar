import { describe, expect, it } from 'vitest';
import { ausreisserFlags, bruttoRendite, iqrGrenzen, mean, median, quantile } from '../src/stats.js';

describe('median', () => {
  it('ungerade Anzahl: mittlerer Wert', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('gerade Anzahl: Mittel der beiden mittleren Werte', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('ein Element', () => {
    expect(median([42])).toBe(42);
  });

  it('verändert die Eingabe nicht', () => {
    const werte = [3, 1, 2];
    median(werte);
    expect(werte).toEqual([3, 1, 2]);
  });

  it('wirft bei leerer Eingabe', () => {
    expect(() => median([])).toThrow(/leere Eingabe/);
  });
});

describe('mean', () => {
  it('arithmetisches Mittel', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('wirft bei leerer Eingabe', () => {
    expect(() => mean([])).toThrow(/leere Eingabe/);
  });
});

describe('quantile (R-7, lineare Interpolation)', () => {
  const werte = [1, 2, 3, 4];

  it('p=0 ist Minimum, p=1 ist Maximum', () => {
    expect(quantile(werte, 0)).toBe(1);
    expect(quantile(werte, 1)).toBe(4);
  });

  it('Q1 bei n=4: Position (4−1)·0,25 = 0,75 → 1 + 0,75·(2−1) = 1,75', () => {
    expect(quantile(werte, 0.25)).toBe(1.75);
  });

  it('Q3 bei n=4: Position 2,25 → 3 + 0,25·(4−3) = 3,25', () => {
    expect(quantile(werte, 0.75)).toBe(3.25);
  });

  it('p=0,5 entspricht dem Median', () => {
    expect(quantile([7, 1, 5, 3], 0.5)).toBe(median([7, 1, 5, 3]));
  });

  it('wirft bei p außerhalb [0, 1]', () => {
    expect(() => quantile(werte, 1.5)).toThrow(/p muss/);
  });
});

describe('iqrGrenzen / ausreisserFlags', () => {
  it('berechnet 1,5×IQR-Grenzen', () => {
    // [1..8]: Q1 = 2,75, Q3 = 6,25, IQR = 3,5 → Grenzen −2,5 und 11,5
    const g = iqrGrenzen([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(g.q1).toBe(2.75);
    expect(g.q3).toBe(6.25);
    expect(g.untere).toBe(-2.5);
    expect(g.obere).toBe(11.5);
  });

  it('markiert einen klaren Ausreißer nach oben', () => {
    expect(ausreisserFlags([10, 11, 12, 13, 100])).toEqual([false, false, false, false, true]);
  });

  it('markiert einen klaren Ausreißer nach unten', () => {
    expect(ausreisserFlags([1, 100, 101, 102, 103])).toEqual([true, false, false, false, false]);
  });

  it('keine Ausreißer in gleichmäßigen Daten', () => {
    expect(ausreisserFlags([10, 12, 14, 16, 18])).toEqual([false, false, false, false, false]);
  });

  it('unter 4 Werten wird nichts markiert (IQR nicht belastbar)', () => {
    expect(ausreisserFlags([1, 1000, 2000])).toEqual([false, false, false]);
  });
});

describe('bruttoRendite', () => {
  it('Beispiel von Hand: 10 €/m² Miete, 3.000 €/m² Kauf → 120/3000 = 4 %', () => {
    expect(bruttoRendite(10, 3000)).toBeCloseTo(0.04, 10);
  });

  it('Klagenfurt-nahes Beispiel: 10,37 × 12 / 3.216 ≈ 3,87 %', () => {
    expect(bruttoRendite(10.37, 3216)).toBeCloseTo(0.038697, 5);
  });

  it('wirft bei Kaufpreis ≤ 0', () => {
    expect(() => bruttoRendite(10, 0)).toThrow(/positiv/);
  });
});
