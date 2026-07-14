import { describe, expect, it } from 'vitest';
import type { BestandInserat, PreisPunkt } from '../src/db/bestand-repo.js';
import { topPicks, TOP_PICKS_MIN_MIET_OBJEKTE } from '../src/top-picks.js';
import { objekteAusBestand, type ObjektZeitreihe } from '../src/trend.js';

const STICHTAG = '2026-07-01';

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

/** Kauf-Zeile mit Fläche 1 m² — preis ist damit direkt der €/m²-Wert. */
function kauf(
  id: string,
  plz: string,
  eurM2: number,
  teil: Partial<BestandInserat & { objektId?: number }> = {},
): BestandInserat & { objektId?: number } {
  return inserat({ id, typ: 'kauf', plz, preis: eurM2, flaeche_m2: 1, ...teil });
}

/** Miete-Zeile mit Fläche 1 m² — preis ist damit direkt der €/m²-Wert. */
function mieteZeile(
  id: string,
  plz: string,
  eurM2: number,
  teil: Partial<BestandInserat & { objektId?: number }> = {},
): BestandInserat & { objektId?: number } {
  return inserat({ id, typ: 'miete', plz, preis: eurM2, flaeche_m2: 1, ...teil });
}

/** Zeitreihen mit automatischer Historie: je Zeile ein Preispunkt ab zuerstGesehen. */
function objekte(bestand: Array<BestandInserat & { objektId?: number }>): ObjektZeitreihe[] {
  const historie: PreisPunkt[] = bestand.map((i) => ({
    portal: i.portal,
    inseratId: i.id,
    preis: i.preis,
    erfasstAm: i.zuerstGesehen,
  }));
  return objekteAusBestand(bestand, historie);
}

/** 5 unauffällige Mieten (Median 10 €/m²) in einer PLZ. */
function fuenfMieten(plz = '9020', praefix = 'm'): Array<BestandInserat & { objektId?: number }> {
  return [8, 9, 10, 11, 12].map((wert, i) => mieteZeile(`${praefix}-${i}`, plz, wert));
}

describe('topPicks', () => {
  it('rechnet die Rendite aus dem PLZ-Miet-Median (Basis "plz")', () => {
    const alle = objekte([...fuenfMieten(), kauf('k-1', '9020', 2400)]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({
      inseratId: 'k-1',
      mieteBasis: 'plz',
      medianMieteEurM2: 10,
      eurM2: 2400,
      kaufpreis: 2400,
      bruttoRendite: (10 * 12) / 2400,
    });
  });

  it('fällt auf den Bezirk zurück, wenn die PLZ zu dünn ist', () => {
    // 4 Mieten in 9020 (< Schwelle), die 5. in 9021 im selben Bezirk.
    const mieten = [8, 9, 10, 11].map((wert, i) => mieteZeile(`m-${i}`, '9020', wert));
    const alle = objekte([
      ...mieten,
      mieteZeile('m-4', '9021', 12, { bezirk: 'Klagenfurt Stadt' }),
      kauf('k-1', '9020', 2400),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ mieteBasis: 'bezirk', medianMieteEurM2: 10 });
  });

  it('fällt auf Kärnten zurück, wenn auch der Bezirk zu dünn ist', () => {
    // 5 Mieten in 5 verschiedenen PLZs und Bezirken — nur Kärnten-weit belastbar.
    const mieten = [8, 9, 10, 11, 12].map((wert, i) =>
      mieteZeile(`m-${i}`, `950${i}`, wert, { bezirk: `Bezirk ${i}` }),
    );
    const alle = objekte([...mieten, kauf('k-1', '9020', 2400)]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ mieteBasis: 'kaernten', medianMieteEurM2: 10 });
  });

  it('verwirft Kauf-Objekte ohne belastbare Basis auf irgendeiner Stufe', () => {
    // Nur 4 Mieten insgesamt — selbst Kärnten bleibt unter der Schwelle.
    const mieten = [8, 9, 10, 11].map((wert, i) => mieteZeile(`m-${i}`, '9020', wert));
    const alle = objekte([...mieten, kauf('k-1', '9020', 2400)]);
    expect(topPicks(alle, STICHTAG, undefined)).toEqual([]);
  });

  it('zählt die Schwelle NACH der Ausreißer-Bereinigung', () => {
    // 5 Mieten in 9020, eine davon Ausreißer → bereinigt 4 → PLZ und Bezirk
    // nicht belastbar; Kärnten (mit 2 weiteren Mieten anderswo) schon.
    const alle = objekte([
      ...[10, 10, 10, 10, 1000].map((wert, i) => mieteZeile(`m-${i}`, '9020', wert)),
      mieteZeile('m-5', '9500', 11, { bezirk: 'Villach Stadt' }),
      mieteZeile('m-6', '9500', 12, { bezirk: 'Villach Stadt' }),
      kauf('k-1', '9020', 2400),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ mieteBasis: 'kaernten', medianMieteEurM2: 10 });
  });

  it('bildet den Miet-Median über die bereinigten Werte', () => {
    // 6 Mieten mit einem Ausreißer → bereinigt 5 (belastbar), Median ohne den
    // Ausreißer 10 statt 10,5.
    const alle = objekte([
      ...[8, 9, 10, 11, 12, 1000].map((wert, i) => mieteZeile(`m-${i}`, '9020', wert)),
      kauf('k-1', '9020', 2400),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks[0]).toMatchObject({ mieteBasis: 'plz', medianMieteEurM2: 10 });
  });

  it('schließt PLZ-lokale Kauf-Ausreißer aus dem Ranking aus', () => {
    // Der absurd billige k-billig hätte die beste Rendite — er ist aber
    // Ausreißer in der 9020-Verteilung und fliegt raus.
    const alle = objekte([
      ...fuenfMieten(),
      kauf('k-billig', '9020', 100),
      kauf('k-1', '9020', 2400),
      kauf('k-2', '9020', 2500),
      kauf('k-3', '9020', 2600),
      kauf('k-4', '9020', 2700),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks.map((p) => p.inseratId)).toEqual(['k-1', 'k-2', 'k-3', 'k-4']);
  });

  it('schließt in dünnen PLZs (< 4 Kauf-Werte) nichts aus', () => {
    // Derselbe billige Preis als einziger Kauf seiner PLZ bleibt im Ranking.
    const alle = objekte([
      ...fuenfMieten(),
      kauf('k-billig', '9500', 100, { bezirk: 'Villach Stadt' }),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks.map((p) => p.inseratId)).toEqual(['k-billig']);
    expect(picks[0]!.mieteBasis).toBe('kaernten');
  });

  it('prüft Ausreißer PLZ-lokal, nicht gegen die Gesamtverteilung', () => {
    // Die 9800er-Käufe wären gegen die 9020-Werte globale Ausreißer,
    // sind in ihrer eigenen PLZ aber unauffällig — alle bleiben drin.
    const alle = objekte([
      ...fuenfMieten(),
      kauf('k-1', '9020', 2400),
      kauf('k-2', '9020', 2500),
      kauf('k-3', '9020', 2600),
      kauf('k-4', '9020', 2700),
      kauf('g-1', '9800', 100, { bezirk: 'Spittal an der Drau' }),
      kauf('g-2', '9800', 110, { bezirk: 'Spittal an der Drau' }),
      kauf('g-3', '9800', 120, { bezirk: 'Spittal an der Drau' }),
      kauf('g-4', '9800', 130, { bezirk: 'Spittal an der Drau' }),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    const ids = picks.map((p) => p.inseratId);
    expect(ids).toContain('g-1');
    expect(ids).toContain('g-4');
    expect(picks).toHaveLength(8);
  });

  it('PLZ-Filter grenzt Kauf ein, die Miet-Basis rechnet weiter mit allen Mieten', () => {
    // Kärnten-Median 10 nur MIT den 9500er-Mieten; wäre die Miet-Menge
    // mitgefiltert, gäbe es unter "90" nur 3 Mieten und keinen Pick.
    const alle = objekte([
      mieteZeile('m-0', '9020', 8),
      mieteZeile('m-1', '9020', 9),
      mieteZeile('m-2', '9020', 10),
      mieteZeile('m-3', '9500', 30, { bezirk: 'Villach Stadt' }),
      mieteZeile('m-4', '9500', 40, { bezirk: 'Villach Stadt' }),
      kauf('k-1', '9020', 2400),
      kauf('k-2', '9500', 2400, { bezirk: 'Villach Stadt' }),
    ]);
    const picks = topPicks(alle, STICHTAG, '90');
    expect(picks.map((p) => p.inseratId)).toEqual(['k-1']);
    expect(picks[0]).toMatchObject({ mieteBasis: 'kaernten', medianMieteEurM2: 10 });
  });

  it('sortiert nach Rendite absteigend', () => {
    const alle = objekte([
      ...fuenfMieten(),
      kauf('k-teuer', '9020', 2700),
      kauf('k-billig', '9020', 2400),
      kauf('k-mittel', '9020', 2500),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks.map((p) => p.inseratId)).toEqual(['k-billig', 'k-mittel', 'k-teuer']);
  });

  it('bricht Rendite-Gleichstand deterministisch: objektId aufsteigend, dann Solos nach Portal/Id', () => {
    // Vier identische €/m² → gleiche Rendite; kein Ausreißer (IQR = 0, alle gleich).
    const alle = objekte([
      ...fuenfMieten(),
      kauf('wh-z', '9020', 2400),
      kauf('a-1', '9020', 2400, { portal: 'immoscout24.at' }),
      kauf('k-obj2', '9020', 2400, { objektId: 2 }),
      kauf('k-obj1', '9020', 2400, { objektId: 1 }),
    ]);
    const picks = topPicks(alle, STICHTAG, undefined);
    expect(picks.map((p) => p.inseratId)).toEqual(['k-obj1', 'k-obj2', 'a-1', 'wh-z']);
    expect(picks[0]!.objektId).toBe(1);
    expect(picks[2]!.portal).toBe('immoscout24.at');
  });

  it('liefert höchstens n Kandidaten (Default 10)', () => {
    const kaeufe = Array.from({ length: 12 }, (_, i) => kauf(`k-${i}`, '9020', 2400 + i * 10));
    const alle = objekte([...fuenfMieten(), ...kaeufe]);
    expect(topPicks(alle, STICHTAG, undefined)).toHaveLength(10);
    expect(topPicks(alle, STICHTAG, undefined, 3)).toHaveLength(3);
    // Die Besten (niedrigster €/m²) zuerst.
    expect(topPicks(alle, STICHTAG, undefined, 3).map((p) => p.inseratId)).toEqual([
      'k-0',
      'k-1',
      'k-2',
    ]);
  });

  it('respektiert minMietObjekte als Parameter', () => {
    const mieten = [9, 10, 11].map((wert, i) => mieteZeile(`m-${i}`, '9020', wert));
    const alle = objekte([...mieten, kauf('k-1', '9020', 2400)]);
    expect(topPicks(alle, STICHTAG, undefined)).toEqual([]); // Default 5
    expect(TOP_PICKS_MIN_MIET_OBJEKTE).toBe(5);
    const picks = topPicks(alle, STICHTAG, undefined, 10, 3);
    expect(picks).toHaveLength(1);
    expect(picks[0]!.medianMieteEurM2).toBe(10);
  });

  it('nutzt den Stichtag-Preis aus der Historie, nicht den letzten', () => {
    const bestand = [...fuenfMieten(), kauf('k-1', '9020', 2600)];
    const historie: PreisPunkt[] = [
      ...bestand
        .filter((i) => i.typ === 'miete')
        .map((i) => ({ portal: i.portal, inseratId: i.id, preis: i.preis, erfasstAm: i.zuerstGesehen })),
      { portal: 'willhaben.at', inseratId: 'k-1', preis: 2600, erfasstAm: '2026-06-01' },
      { portal: 'willhaben.at', inseratId: 'k-1', preis: 2400, erfasstAm: '2026-06-20' },
    ];
    const picks = topPicks(objekteAusBestand(bestand, historie), STICHTAG, undefined);
    expect(picks[0]).toMatchObject({ kaufpreis: 2400, eurM2: 2400 });
    // Am früheren Stichtag gilt der damalige Preis.
    const frueher = topPicks(objekteAusBestand(bestand, historie), '2026-06-10', undefined);
    expect(frueher[0]).toMatchObject({ kaufpreis: 2600, eurM2: 2600 });
  });

  it('Randfälle: leerer Bestand, Stichtag vor aller Aktivität, leerer PLZ-Filter', () => {
    expect(topPicks([], STICHTAG, undefined)).toEqual([]);
    const alle = objekte([...fuenfMieten(), kauf('k-1', '9020', 2400)]);
    expect(topPicks(alle, '2026-01-01', undefined)).toEqual([]);
    expect(topPicks(alle, STICHTAG, '')).toEqual(topPicks(alle, STICHTAG, undefined));
  });
});
