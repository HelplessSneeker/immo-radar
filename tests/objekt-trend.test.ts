import { describe, expect, it } from 'vitest';
import type { BestandInserat, PreisPunkt } from '../src/db/bestand-repo.js';
import { median } from '../src/stats.js';
import {
  berechneObjektTrend,
  berechneRenditeTrend,
  datenpunkteAmStichtag,
  filterObjekte,
  objekteAusBestand,
  stichtageFuerTrend,
  streuungJeStichtag,
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
    const trend = berechneObjektTrend(objekteAusBestand(bestand, historie), [
      '2026-06-01',
      '2026-07-01',
    ]);
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
    const trend = berechneObjektTrend(objekteAusBestand(bestand, historie), [
      '2026-06-01',
      '2026-07-01',
    ]);
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
    const trend = berechneObjektTrend(objekte, ['2026-05-01', '2026-06-10', '2026-07-01']);
    expect(trend.at(-1)!.medianKaufEurM2).toBe(3800); // neuer Preis
    expect(trend[0]!.medianKaufEurM2).toBe(4000); // alter Preis am Anfang
    // In der Lücke (2026-06-10: wh-alt delistet, wh-neu noch nicht da) ist
    // das Objekt nicht aktiv — die Reihe zeigt die Lücke ehrlich.
    const luecke = trend.find((p) => p.datum === '2026-06-10');
    expect(luecke?.anzahlKauf ?? 0).toBe(0);
  });

  it('aktiv exakt bis zuletztGesehen: am Tag selbst dabei, am nächsten Stichtag nicht mehr', () => {
    const objekte = objekteAusBestand(
      [inserat({ id: 'wh-1', zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-06-10' })],
      [punkt('willhaben.at', 'wh-1', 200000, '2026-06-01')],
    );
    const trend = berechneObjektTrend(objekte, ['2026-06-10', '2026-06-11']);
    expect(trend.map((p) => p.anzahlKauf)).toEqual([1, 0]);
  });

  it('überbrückt einen fehlgeschlagenen Lauf: gesehen am 07. und 09. ⇒ aktiv an beiden Stichtagen', () => {
    // Der 08. war ein fehlgeschlagener Lauf und ist kein Stichtag; das
    // Inserat wurde am 09. wieder gesehen und zählt daher auch am 07.
    const objekte = objekteAusBestand(
      [inserat({ id: 'wh-1', zuerstGesehen: '2026-07-03', zuletztGesehen: '2026-07-09' })],
      [punkt('willhaben.at', 'wh-1', 200000, '2026-07-03')],
    );
    const trend = berechneObjektTrend(objekte, ['2026-07-07', '2026-07-09']);
    expect(trend.map((p) => p.anzahlKauf)).toEqual([1, 1]);
  });

  it('schneidet Stichtage vor dem ersten Datenpunkt der (gefilterten) Objekte ab', () => {
    const objekte = objekteAusBestand(
      [inserat({ id: 'wh-1', zuerstGesehen: '2026-06-15' })],
      [punkt('willhaben.at', 'wh-1', 200000, '2026-06-15')],
    );
    const trend = berechneObjektTrend(objekte, ['2026-06-01', '2026-06-15', '2026-07-01']);
    expect(trend.map((p) => p.datum)).toEqual(['2026-06-15', '2026-07-01']);
  });
});

describe('stichtageFuerTrend', () => {
  it('vereinigt Sweep-Tage mit Beobachtungstagen vor dem ersten Sweep, dedupliziert und sortiert', () => {
    const objekte = objekteAusBestand(
      [
        // Import-Ära: vor dem ersten protokollierten Sweep gesehen.
        inserat({ id: 'wh-1', zuerstGesehen: '2026-07-03', zuletztGesehen: '2026-07-06' }),
        inserat({ id: 'wh-2', zuerstGesehen: '2026-07-06', zuletztGesehen: '2026-07-09' }),
        // Beobachtung NACH dem ersten Sweep-Tag (2026-07-08, Partial eines
        // fehlgeschlagenen Laufs) darf keinen eigenen Stichtag erzeugen.
        inserat({ id: 'wh-3', zuerstGesehen: '2026-07-08', zuletztGesehen: '2026-07-09' }),
      ],
      [punkt('willhaben.at', 'wh-1', 180000, '2026-07-03')],
    );
    expect(stichtageFuerTrend(objekte, ['2026-07-07', '2026-07-09'])).toEqual([
      '2026-07-03',
      '2026-07-06',
      '2026-07-07',
      '2026-07-09',
    ]);
  });

  it('nimmt auch Historien-Tage vor dem ersten Sweep als Stichtage', () => {
    const objekte = objekteAusBestand(
      [inserat({ id: 'wh-1', zuerstGesehen: '2026-07-01', zuletztGesehen: '2026-07-09' })],
      [
        punkt('willhaben.at', 'wh-1', 200000, '2026-07-01'),
        punkt('willhaben.at', 'wh-1', 190000, '2026-07-04'),
      ],
    );
    expect(stichtageFuerTrend(objekte, ['2026-07-09'])).toEqual([
      '2026-07-01',
      '2026-07-04',
      '2026-07-09',
    ]);
  });

  it('ohne protokollierte Sweeps sind alle Beobachtungstage Stichtage', () => {
    const objekte = objekteAusBestand(
      [inserat({ id: 'wh-1', zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-07-01' })],
      [punkt('willhaben.at', 'wh-1', 200000, '2026-06-01')],
    );
    expect(stichtageFuerTrend(objekte, [])).toEqual(['2026-06-01', '2026-07-01']);
  });
});

describe('datenpunkteAmStichtag', () => {
  it('trennt Kauf und Miete und sortiert je Serie aufsteigend nach €/m²', () => {
    const bestand = [
      inserat({ id: 'wh-1', preis: 200000 }), // 4000 €/m²
      inserat({ id: 'wh-2', preis: 180000 }), // 3600 €/m²
      inserat({ id: 'wh-3', typ: 'miete', preis: 500 }), // 10 €/m²
    ];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('willhaben.at', 'wh-2', 180000, '2026-06-01'),
      punkt('willhaben.at', 'wh-3', 500, '2026-06-01'),
    ];
    const { kauf, miete } = datenpunkteAmStichtag(objekteAusBestand(bestand, historie), '2026-07-01');
    expect(kauf.map((p) => p.eurM2)).toEqual([3600, 4000]);
    expect(miete.map((p) => p.eurM2)).toEqual([10]);
    expect(kauf[0]).toMatchObject({ ort: 'Klagenfurt', plz: '9020', zimmer: 3, flaecheM2: 50, preis: 180000 });
  });

  it('liefert pro Objekt einen Punkt: das Minimum-Inserat samt url/portal, Anzahl dedupliziert', () => {
    const bestand = [
      inserat({ id: 'wh-1', objektId: 1, preis: 200000, url: 'https://willhaben.at/wh-1' }),
      inserat({
        id: 'is24-1',
        portal: 'immoscout24.at',
        objektId: 1,
        preis: 195000,
        url: 'https://immoscout24.at/is24-1',
      }),
    ];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('immoscout24.at', 'is24-1', 195000, '2026-06-01'),
    ];
    const { kauf } = datenpunkteAmStichtag(objekteAusBestand(bestand, historie), '2026-07-01');
    expect(kauf).toHaveLength(1);
    expect(kauf[0]).toMatchObject({
      objektId: 1,
      eurM2: 3900,
      preis: 195000,
      portal: 'immoscout24.at',
      inseratId: 'is24-1',
      url: 'https://immoscout24.at/is24-1',
      anzahlInserate: 2,
    });
  });

  it('nimmt den historischen Preis am Stichtag, nicht den letzten', () => {
    const bestand = [inserat({ id: 'wh-1' })];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('willhaben.at', 'wh-1', 180000, '2026-06-20'),
    ];
    const objekte = objekteAusBestand(bestand, historie);
    expect(datenpunkteAmStichtag(objekte, '2026-06-10').kauf[0]).toMatchObject({
      preis: 200000,
      eurM2: 4000,
    });
    expect(datenpunkteAmStichtag(objekte, '2026-07-01').kauf[0]).toMatchObject({
      preis: 180000,
      eurM2: 3600,
    });
  });

  it('lässt inaktive Objekte und solche ohne auswertbare Fläche weg', () => {
    const bestand = [
      inserat({ id: 'wh-alt', zuletztGesehen: '2026-06-10' }), // am Stichtag längst delistet
      inserat({ id: 'wh-flaeche', flaeche_m2: 0 }),
    ];
    const historie = [
      punkt('willhaben.at', 'wh-alt', 200000, '2026-06-01'),
      punkt('willhaben.at', 'wh-flaeche', 200000, '2026-06-01'),
    ];
    const { kauf, miete } = datenpunkteAmStichtag(objekteAusBestand(bestand, historie), '2026-07-01');
    expect(kauf).toHaveLength(0);
    expect(miete).toHaveLength(0);
  });

  it('Konsistenz-Invariante: Median und Anzahl der Punkte decken sich mit berechneObjektTrend', () => {
    const bestand = [
      inserat({ id: 'wh-1', objektId: 1, preis: 200000 }),
      inserat({ id: 'is24-1', portal: 'immoscout24.at', objektId: 1, preis: 195000 }),
      inserat({ id: 'wh-2', preis: 240000, flaeche_m2: 60 }),
      inserat({ id: 'wh-3', preis: 150000, flaeche_m2: 45, zuerstGesehen: '2026-06-15' }),
      inserat({ id: 'wh-4', typ: 'miete', preis: 600, flaeche_m2: 55 }),
    ];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('immoscout24.at', 'is24-1', 195000, '2026-06-01'),
      punkt('willhaben.at', 'wh-2', 240000, '2026-06-01'),
      punkt('willhaben.at', 'wh-3', 150000, '2026-06-15'),
      punkt('willhaben.at', 'wh-4', 600, '2026-06-01'),
    ];
    const objekte = objekteAusBestand(bestand, historie);
    const trend = berechneObjektTrend(objekte, ['2026-06-01', '2026-06-15', '2026-07-01']);
    for (const punkt of trend) {
      const { kauf, miete } = datenpunkteAmStichtag(objekte, punkt.datum);
      expect(kauf).toHaveLength(punkt.anzahlKauf);
      expect(miete).toHaveLength(punkt.anzahlMiete);
      expect(kauf.length > 0 ? median(kauf.map((p) => p.eurM2)) : null).toBe(punkt.medianKaufEurM2);
      expect(miete.length > 0 ? median(miete.map((p) => p.eurM2)) : null).toBe(punkt.medianMieteEurM2);
    }
  });
});

describe('streuungJeStichtag', () => {
  it('liefert je Stichtag exakt die Werte, deren Median der Trend bildet', () => {
    const bestand = [
      inserat({ id: 'wh-1', objektId: 1, preis: 200000 }),
      inserat({ id: 'is24-1', portal: 'immoscout24.at', objektId: 1, preis: 195000 }),
      inserat({ id: 'wh-2', preis: 240000, flaeche_m2: 60 }),
      inserat({ id: 'wh-3', typ: 'miete', preis: 600, flaeche_m2: 55, zuerstGesehen: '2026-06-15' }),
    ];
    const historie = [
      punkt('willhaben.at', 'wh-1', 200000, '2026-06-01'),
      punkt('immoscout24.at', 'is24-1', 195000, '2026-06-01'),
      punkt('willhaben.at', 'wh-2', 240000, '2026-06-01'),
      punkt('willhaben.at', 'wh-3', 600, '2026-06-15'),
    ];
    const objekte = objekteAusBestand(bestand, historie);
    const trend = berechneObjektTrend(objekte, ['2026-06-01', '2026-06-15', '2026-07-01']);
    const streuung = streuungJeStichtag(objekte, trend.map((t) => t.datum));
    expect(streuung.map((s) => s.datum)).toEqual(trend.map((t) => t.datum));
    trend.forEach((t, i) => {
      const s = streuung[i]!;
      expect(s.kauf).toHaveLength(t.anzahlKauf);
      expect(s.miete).toHaveLength(t.anzahlMiete);
      expect(s.kauf.length > 0 ? median(s.kauf) : null).toBe(t.medianKaufEurM2);
      expect(s.miete.length > 0 ? median(s.miete) : null).toBe(t.medianMieteEurM2);
    });
    // Dedupliziert: Objekt 1 liefert einen Wert (das Minimum), nicht zwei.
    expect(streuung.at(-1)!.kauf.sort((a, b) => a - b)).toEqual([3900, 4000]);
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
