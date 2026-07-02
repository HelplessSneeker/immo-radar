import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze.js';
import type { Inserat } from '../src/types.js';

let laufendeId = 0;

function inserat(overrides: Partial<Inserat> & Pick<Inserat, 'typ' | 'preis' | 'flaeche_m2'>): Inserat {
  laufendeId += 1;
  return {
    id: `T-${laufendeId}`,
    ort: 'Testort',
    plz: '9999',
    bezirk: 'Testbezirk',
    zimmer: 2,
    datum_erfasst: '2026-06-01',
    ...overrides,
  };
}

describe('analyze', () => {
  it('berechnet €/m²-Kennzahlen je Gebiet und Typ', () => {
    const ergebnis = analyze([
      // €/m²: 3000, 3200, 3400 → Median 3200, Mittel 3200
      inserat({ typ: 'kauf', preis: 150000, flaeche_m2: 50 }),
      inserat({ typ: 'kauf', preis: 160000, flaeche_m2: 50 }),
      inserat({ typ: 'kauf', preis: 170000, flaeche_m2: 50 }),
      // €/m²: 10 und 12 → Median 11
      inserat({ typ: 'miete', preis: 500, flaeche_m2: 50 }),
      inserat({ typ: 'miete', preis: 600, flaeche_m2: 50 }),
    ]);

    expect(ergebnis.gebiete).toHaveLength(1);
    const gebiet = ergebnis.gebiete[0]!;
    expect(gebiet.gebiet).toBe('Testort');
    expect(gebiet.kauf).toMatchObject({ anzahl: 3, medianEurM2: 3200, meanEurM2: 3200, minEurM2: 3000, maxEurM2: 3400 });
    expect(gebiet.miete).toMatchObject({ anzahl: 2, medianEurM2: 11, minEurM2: 10, maxEurM2: 12 });
    // Rendite: 11 × 12 / 3200 = 132/3200 = 4,125 %
    expect(gebiet.bruttoRendite).toBeCloseTo(0.04125, 10);
  });

  it('Rendite ist null, wenn Kauf- oder Mietdaten fehlen', () => {
    const nurKauf = analyze([inserat({ typ: 'kauf', preis: 150000, flaeche_m2: 50 })]);
    expect(nurKauf.gebiete[0]!.miete).toBeNull();
    expect(nurKauf.gebiete[0]!.bruttoRendite).toBeNull();
  });

  it('markiert Ausreißer je Gebiet und Typ getrennt', () => {
    const ergebnis = analyze([
      // Kauf-€/m²: 3000, 3100, 3200, 3300 und 9000 → letzterer ist Ausreißer
      inserat({ typ: 'kauf', preis: 150000, flaeche_m2: 50 }),
      inserat({ typ: 'kauf', preis: 155000, flaeche_m2: 50 }),
      inserat({ typ: 'kauf', preis: 160000, flaeche_m2: 50 }),
      inserat({ typ: 'kauf', preis: 165000, flaeche_m2: 50 }),
      inserat({ id: 'AUSSER', typ: 'kauf', preis: 450000, flaeche_m2: 50 }),
      // Miete unauffällig – 9000 €/m² Kauf darf hier nichts beeinflussen
      inserat({ typ: 'miete', preis: 500, flaeche_m2: 50 }),
      inserat({ typ: 'miete', preis: 550, flaeche_m2: 50 }),
    ]);

    expect(ergebnis.gebiete[0]!.kauf!.ausreisserIds).toEqual(['AUSSER']);
    expect(ergebnis.gebiete[0]!.miete!.ausreisserIds).toEqual([]);
    const flags = new Map(ergebnis.inserate.map((i) => [i.id, i.istAusreisser]));
    expect(flags.get('AUSSER')).toBe(true);
    expect([...flags.values()].filter(Boolean)).toHaveLength(1);
  });

  it('trennt Gebiete und sortiert sie alphabetisch', () => {
    const ergebnis = analyze([
      inserat({ ort: 'Villach', typ: 'kauf', preis: 150000, flaeche_m2: 50 }),
      inserat({ ort: 'Feldkirchen', typ: 'kauf', preis: 110000, flaeche_m2: 50 }),
    ]);
    expect(ergebnis.gebiete.map((g) => g.gebiet)).toEqual(['Feldkirchen', 'Villach']);
  });

  it('wirft bei doppelten IDs', () => {
    const a = inserat({ typ: 'kauf', preis: 150000, flaeche_m2: 50 });
    expect(() => analyze([a, { ...a }])).toThrow(/Doppelte Inserats-ID/);
  });
});
