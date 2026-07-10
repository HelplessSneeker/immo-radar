import { describe, expect, it } from 'vitest';
import type { BestandInserat, PreisPunkt } from '../src/db/bestand-repo.js';
import {
  berechneLaufDiff,
  berechneRendite,
  letztePreisAenderungen,
  vermarktungsdauer,
} from '../src/trend.js';
import type { InseratTyp } from '../src/types.js';

function inserat(
  id: string,
  teil: Partial<BestandInserat> & { typ?: InseratTyp } = {},
): BestandInserat {
  return {
    id,
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis: 200000,
    flaeche_m2: 100,
    zimmer: 3,
    datum_erfasst: '2026-06-01',
    zuerstGesehen: '2026-06-01',
    zuletztGesehen: '2026-07-03',
    ...teil,
  };
}

function punkt(inseratId: string, preis: number, erfasstAm: string): PreisPunkt {
  return { portal: 'willhaben.at', inseratId, preis, erfasstAm };
}

describe('vermarktungsdauer', () => {
  it('berechnet Median und Mittel je Typ', () => {
    const delisted = [
      inserat('wh-1', { zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-06-11' }), // 10 Tage
      inserat('wh-2', { zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-06-21' }), // 20 Tage
      inserat('wh-3', {
        typ: 'miete',
        zuerstGesehen: '2026-06-01',
        zuletztGesehen: '2026-06-05',
      }), // 4 Tage
    ];

    const statistik = vermarktungsdauer(delisted);
    expect(statistik.kauf).toEqual({ anzahl: 2, medianTage: 15, meanTage: 15 });
    expect(statistik.miete).toEqual({ anzahl: 1, medianTage: 4, meanTage: 4 });
  });

  it('meldet null für Typen ohne delistete Inserate', () => {
    expect(vermarktungsdauer([])).toEqual({ kauf: null, miete: null });
  });
});

describe('berechneRendite', () => {
  it('berechnet die Bruttorendite aus den Medianen beider Typen', () => {
    const aktive = [
      inserat('wh-1', { typ: 'kauf', preis: 300000, flaeche_m2: 100 }), // 3000 €/m²
      inserat('wh-2', { typ: 'miete', preis: 1000, flaeche_m2: 100 }), // 10 €/m²
    ];
    // 10 × 12 / 3000 = 4 %
    expect(berechneRendite(aktive)).toEqual({
      brutto: 0.04,
      medianKaufEurM2: 3000,
      medianMieteEurM2: 10,
      anzahlKauf: 1,
      anzahlMiete: 1,
    });
  });

  it('liefert null, wenn ein Typ fehlt', () => {
    expect(berechneRendite([inserat('wh-1', { typ: 'kauf' })])).toBeNull();
    expect(berechneRendite([inserat('wh-1', { typ: 'miete', preis: 800 })])).toBeNull();
    expect(berechneRendite([])).toBeNull();
  });

  it('überspringt Inserate ohne auswertbare Fläche', () => {
    const aktive = [
      inserat('wh-1', { typ: 'kauf', preis: 300000, flaeche_m2: 100 }),
      inserat('wh-2', { typ: 'miete', preis: 1000, flaeche_m2: 0 }),
    ];
    // Die einzige Miete hat keine Fläche → kein Miet-Median → null
    expect(berechneRendite(aktive)).toBeNull();
  });
});

describe('berechneLaufDiff', () => {
  const LAUF = '2026-07-03';
  const VORHER = '2026-07-02';

  it('meldet neue, delistete und preisgeänderte Inserate des Tages', () => {
    const inserate = [
      inserat('neu', { zuerstGesehen: LAUF, zuletztGesehen: LAUF }),
      inserat('weg', { zuerstGesehen: '2026-06-01', zuletztGesehen: VORHER }),
      inserat('geaendert', { zuerstGesehen: '2026-06-01', zuletztGesehen: LAUF }),
      inserat('unveraendert', { zuerstGesehen: '2026-06-01', zuletztGesehen: LAUF }),
    ];
    const historie = [
      punkt('neu', 200000, LAUF), // Erst-Zeile → keine Preisänderung
      punkt('geaendert', 250000, '2026-06-01'),
      punkt('geaendert', 240000, LAUF),
      punkt('unveraendert', 300000, '2026-06-01'),
    ];

    const diff = berechneLaufDiff(inserate, historie, LAUF, VORHER);
    expect(diff.neue.map((i) => i.id)).toEqual(['neu']);
    expect(diff.delistete.map((i) => i.id)).toEqual(['weg']);
    expect(diff.preisAenderungen).toEqual([
      { inserat: inserate[2], alterPreis: 250000, neuerPreis: 240000 },
    ]);
  });

  it('grenzt das Delist-Fenster korrekt ab: vorheriger Lauf inklusive, Lauf-Tag exklusiv', () => {
    const inserate = [
      inserat('genau-vorher', { zuerstGesehen: '2026-06-01', zuletztGesehen: VORHER }),
      inserat('noch-aelter', { zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-07-01' }),
      inserat('am-lauf-tag', { zuerstGesehen: '2026-06-01', zuletztGesehen: LAUF }),
    ];

    const diff = berechneLaufDiff(inserate, [], LAUF, VORHER);
    // „noch-aelter" verschwand schon vor dem vorherigen Lauf → zählt zu einem früheren Diff
    expect(diff.delistete.map((i) => i.id)).toEqual(['genau-vorher']);
  });

  it('erster Lauf: alles neu Gesehene ist neu, Delistings gibt es nicht', () => {
    const inserate = [inserat('wh-1', { zuerstGesehen: LAUF, zuletztGesehen: LAUF })];
    const diff = berechneLaufDiff(inserate, [punkt('wh-1', 200000, LAUF)], LAUF, undefined);
    expect(diff.neue.map((i) => i.id)).toEqual(['wh-1']);
    expect(diff.delistete).toEqual([]);
    expect(diff.preisAenderungen).toEqual([]);
  });

  it('ignoriert Historien-Punkte mit unverändertem Preis', () => {
    const inserate = [inserat('wh-1', { zuerstGesehen: '2026-06-01', zuletztGesehen: LAUF })];
    const historie = [punkt('wh-1', 200000, '2026-06-01'), punkt('wh-1', 200000, LAUF)];
    expect(berechneLaufDiff(inserate, historie, LAUF, VORHER).preisAenderungen).toEqual([]);
  });
});

describe('letztePreisAenderungen', () => {
  it('meldet die letzte Änderung je Inserat, Senkungen wie Erhöhungen', () => {
    const historie = [
      // wh-1: zweimal geändert → nur die letzte Änderung zählt
      punkt('wh-1', 200000, '2026-06-01'),
      punkt('wh-1', 190000, '2026-06-10'),
      punkt('wh-1', 185000, '2026-06-15'),
      // wh-2: erhöht
      punkt('wh-2', 100000, '2026-06-01'),
      punkt('wh-2', 110000, '2026-06-10'),
    ];

    const aenderungen = letztePreisAenderungen(historie);
    expect(aenderungen.get('willhaben.at wh-1')).toEqual({
      alterPreis: 190000,
      neuerPreis: 185000,
      geaendertAm: '2026-06-15',
    });
    expect(aenderungen.get('willhaben.at wh-2')).toEqual({
      alterPreis: 100000,
      neuerPreis: 110000,
      geaendertAm: '2026-06-10',
    });
  });

  it('lässt Inserate ohne Änderung (nur Erst-Zeile) weg', () => {
    const historie = [punkt('wh-4', 150000, '2026-06-01')];
    expect(letztePreisAenderungen(historie).size).toBe(0);
  });

  it('liefert eine leere Map ohne Historie', () => {
    expect(letztePreisAenderungen([]).size).toBe(0);
  });
});
