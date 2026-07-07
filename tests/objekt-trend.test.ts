import { describe, expect, it } from 'vitest';
import type { BestandInserat, PreisPunkt } from '../src/db/bestand-repo.js';
import {
  berechneObjektTrend,
  berechneRenditeTrend,
  filterObjekte,
  objekteAusBestand,
  type ObjektZeitreihe,
} from '../src/trend.js';

function inserat(
  overrides: Partial<BestandInserat & { objektId?: number }> & { id: string },
): BestandInserat & { objektId?: number } {
  return {
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: 200000,
    flaeche_m2: 50,
    zimmer: 3,
    datum_erfasst: '2026-06-01',
    zuerstGesehen: '2026-06-01',
    zuletztGesehen: '2026-07-01',
    ...overrides,
  };
}

function punkt(portal: string, inseratId: string, preis: number, erfasstAm: string): PreisPunkt {
  return { portal, inseratId, preis, erfasstAm };
}

describe('objekteAusBestand', () => {
  it('gruppiert nach objekt_id; Aktivität ist die Vereinigung der Fenster', () => {
    const bestand = [
      inserat({ id: 'wh-1', objektId: 1, zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-06-20' }),
      inserat({
        id: 'is24-1',
        portal: 'immoscout24.at',
        objektId: 1,
        zuerstGesehen: '2026-06-10',
        zuletztGesehen: '2026-07-01',
      }),
      inserat({ id: 'wh-2', objektId: 2 }),
    ];
    const objekte = objekteAusBestand(bestand, []);
    expect(objekte).toHaveLength(2);
    const [erstes] = objekte;
    expect(erstes).toMatchObject({
      objektId: 1,
      zuerstGesehen: '2026-06-01',
      zuletztGesehen: '2026-07-01',
    });
    expect(erstes!.inserate.map((i) => i.inseratId)).toEqual(['wh-1', 'is24-1']);
  });

  it('Inserate ohne objekt_id werden Ein-Inserat-Objekte, PLZ/Ort normalisiert', () => {
    const objekte = objekteAusBestand(
      [inserat({ id: 'wh-1', plz: '9020 Klagenfurt', ort: '9020 Klagenfurt' })],
      [],
    );
    expect(objekte).toHaveLength(1);
    expect(objekte[0]).toMatchObject({ plz: '9020', ort: 'Klagenfurt' });
    expect(objekte[0]!.objektId).toBeUndefined();
  });
});

describe('berechneObjektTrend', () => {
  it('zählt ein Cross-Portal-Duplikat einmal — zum niedrigeren €/m²', () => {
    const bestand = [
      inserat({ id: 'wh-1', objektId: 1, preis: 200000 }), // 4000 €/m²
      inserat({ id: 'is24-1', portal: 'immoscout24.at', objektId: 1, preis: 195000 }), // 3900 €/m²
    ];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('immoscout24.at', 'is24-1', 195000, '2026-06-01'),
    ];
    const trend = berechneObjektTrend(objekteAusBestand(bestand, historie), '2026-07-01');
    const letzter = trend.at(-1)!;
    expect(letzter.anzahlKauf).toBe(1);
    expect(letzter.medianKaufEurM2).toBe(3900);
  });

  it('ein Objekt bleibt aktiv, solange ein Portal noch listet', () => {
    const bestand = [
      // willhaben delistet am 2026-06-10, immoscout listet bis 2026-07-01.
      inserat({ id: 'wh-1', objektId: 1, zuletztGesehen: '2026-06-10' }),
      inserat({
        id: 'is24-1',
        portal: 'immoscout24.at',
        objektId: 1,
        preis: 210000,
        zuletztGesehen: '2026-07-01',
      }),
    ];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('immoscout24.at', 'is24-1', 210000, '2026-06-01'),
    ];
    const trend = berechneObjektTrend(objekteAusBestand(bestand, historie), '2026-07-01');
    const letzter = trend.at(-1)!;
    // Am Ende zählt nur noch das is24-Inserat (wh ist delistet) ⇒ 4200 €/m².
    expect(letzter.anzahlKauf).toBe(1);
    expect(letzter.medianKaufEurM2).toBe(4200);
    // Früh im Fenster liefert willhaben das Minimum (4000 €/m²).
    expect(trend[0]!.medianKaufEurM2).toBe(4000);
  });

  it('eine Wiedereinstellung hält die Reihe des Objekts am Laufen', () => {
    const bestand = [
      inserat({ id: 'wh-alt', objektId: 1, zuerstGesehen: '2026-05-01', zuletztGesehen: '2026-05-30' }),
      inserat({
        id: 'wh-neu',
        objektId: 1,
        preis: 190000,
        zuerstGesehen: '2026-06-15',
        zuletztGesehen: '2026-07-01',
      }),
    ];
    const historie = [
      punkt('willhaben.at', 'wh-alt', 200000, '2026-05-01'),
      punkt('willhaben.at', 'wh-neu', 190000, '2026-06-15'),
    ];
    const objekte = objekteAusBestand(bestand, historie);
    expect(objekte).toHaveLength(1);
    const trend = berechneObjektTrend(objekte, '2026-07-01');
    expect(trend.at(-1)!.medianKaufEurM2).toBe(3800); // neuer Preis
    expect(trend[0]!.medianKaufEurM2).toBe(4000); // alter Preis am Anfang
    // In der Lücke (z. B. 2026-06-10) ist das Objekt nicht aktiv.
    const luecke = trend.find((p) => p.datum === '2026-06-10');
    expect(luecke?.anzahlKauf ?? 0).toBe(0);
  });
});

describe('berechneRenditeTrend', () => {
  it('bildet Miete×12 ÷ Kauf je Punkt und null bei fehlender Marktseite', () => {
    const trend = [
      { datum: '2026-06-01', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 5, anzahlMiete: 4 },
      { datum: '2026-06-08', medianKaufEurM2: 4000, medianMieteEurM2: null, anzahlKauf: 5, anzahlMiete: 0 },
    ];
    expect(berechneRenditeTrend(trend)).toEqual([
      { datum: '2026-06-01', bruttoRendite: 0.03 }, // 120 / 4000
      { datum: '2026-06-08', bruttoRendite: null },
    ]);
  });
});

describe('filterObjekte', () => {
  const objekte: ObjektZeitreihe[] = objekteAusBestand(
    [
      inserat({ id: 'wh-1', plz: '9020', flaeche_m2: 45 }),
      inserat({ id: 'wh-2', plz: '9500', flaeche_m2: 70 }),
      inserat({ id: 'wh-3', plz: '9800', flaeche_m2: 100 }),
    ],
    [],
  );

  it('PLZ als Präfix: "9020" exakt, "95" Region, leer alles', () => {
    expect(filterObjekte(objekte, { plz: '9020' })).toHaveLength(1);
    expect(filterObjekte(objekte, { plz: '95' })).toHaveLength(1);
    expect(filterObjekte(objekte, { plz: '9' })).toHaveLength(3);
    expect(filterObjekte(objekte, {})).toHaveLength(3);
  });

  it('m²-Bereich inklusive Grenzen', () => {
    expect(filterObjekte(objekte, { flaecheMin: 45, flaecheMax: 70 })).toHaveLength(2);
    expect(filterObjekte(objekte, { flaecheMin: 71 })).toHaveLength(1);
    expect(filterObjekte(objekte, { flaecheMax: 44.9 })).toHaveLength(0);
  });
});
