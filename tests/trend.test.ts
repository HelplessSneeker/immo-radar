import { describe, expect, it } from 'vitest';
import type { BestandInserat, PreisPunkt } from '../src/db/bestand-repo.js';
import { berechneTrend, letztePreisAenderungen, vermarktungsdauer } from '../src/trend.js';
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

describe('berechneTrend', () => {
  it('liefert ein Wochenraster, dessen letzter Punkt bisDatum ist', () => {
    const inserate = [inserat('wh-1')];
    const historie = [punkt('wh-1', 200000, '2026-06-01')];

    const trend = berechneTrend(inserate, historie, '2026-06-20');
    expect(trend.map((t) => t.datum)).toEqual(['2026-06-06', '2026-06-13', '2026-06-20']);
  });

  it('rekonstruiert den Preis zum Stichtag aus der Historie', () => {
    const inserate = [inserat('wh-1', { flaeche_m2: 100 })];
    const historie = [punkt('wh-1', 200000, '2026-06-01'), punkt('wh-1', 180000, '2026-06-15')];

    const trend = berechneTrend(inserate, historie, '2026-06-20');
    // 2026-06-06 und -13: alter Preis; -20: gesenkter Preis
    expect(trend.map((t) => t.medianKaufEurM2)).toEqual([2000, 2000, 1800]);
  });

  it('zählt Inserate nur in ihrem Sichtbarkeitsfenster', () => {
    const inserate = [
      inserat('wh-1', { zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-06-10' }),
      inserat('wh-2', { zuerstGesehen: '2026-06-12', zuletztGesehen: '2026-06-20' }),
    ];
    const historie = [punkt('wh-1', 200000, '2026-06-01'), punkt('wh-2', 300000, '2026-06-12')];

    const trend = berechneTrend(inserate, historie, '2026-06-20');
    // Am 13.6. zählen beide: wh-1 wurde am 10.6. (im 7-Tage-Fenster) noch
    // gesehen, wh-2 ist ab 12.6. da. Am 20.6. ist wh-1 delistet.
    expect(trend.map((t) => t.anzahlKauf)).toEqual([1, 2, 1]);
    expect(trend.map((t) => t.medianKaufEurM2)).toEqual([2000, 2500, 3000]);
  });

  it('trennt Kauf und Miete und meldet null ohne Daten', () => {
    const inserate = [
      inserat('wh-1', { typ: 'miete', preis: 800, zuerstGesehen: '2026-06-14' }),
    ];
    const historie = [punkt('wh-1', 800, '2026-06-14')];

    const trend = berechneTrend(inserate, historie, '2026-06-20');
    const letzter = trend[trend.length - 1]!;
    expect(letzter).toEqual({
      datum: '2026-06-20',
      medianKaufEurM2: null,
      medianMieteEurM2: 8,
      anzahlKauf: 0,
      anzahlMiete: 1,
    });
  });

  it('liefert eine leere Zeitreihe ohne Inserate', () => {
    expect(berechneTrend([], [], '2026-06-20')).toEqual([]);
  });
});

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
