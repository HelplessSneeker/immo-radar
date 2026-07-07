import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalFehler, type PortalAdapter, type SuchOptionen } from '../src/adapters/portal-adapter.js';
import type { SweepSegmentKey } from '../src/db/sweep-repo.js';
import { segmentSchluessel } from '../src/db/sweep-repo.js';
import type { SuchKriterien } from '../src/search.js';
import { basisSegmente, fuehreSweepAus, preisBaender, type SweepDeps } from '../src/sweep.js';
import type { Inserat } from '../src/types.js';

function inserat(id: string, typ: 'kauf' | 'miete' = 'kauf'): Inserat {
  return {
    id,
    typ,
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis: typ === 'kauf' ? 200000 : 800,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-07-07',
  };
}

interface PortalVerhalten {
  /** Wirft bei jedem Aufruf. */
  fehler?: boolean;
  /**
   * Liefert die Gesamttreffer je Aufruf — Sättigung, wenn größer als die
   * Zahl gelieferter Inserate. Default: ungesättigt (1 Inserat, 1 Treffer).
   */
  antwort?: (kriterien: SuchKriterien) => { anzahl: number; gesamtTreffer: number };
}

function fakePortal(
  portalName: string,
  aufrufe: string[],
  verhalten: PortalVerhalten = {},
): PortalAdapter {
  let laufendeNr = 0;
  return {
    name: portalName,
    portal: portalName,
    canHandle: () => false,
    fetch: () => Promise.resolve([]),
    sucheMitStatistik: (kriterien: SuchKriterien, optionen?: SuchOptionen) => {
      const band = `${kriterien.preisMin ?? ''}-${kriterien.preisMax ?? ''}`;
      aufrufe.push(
        `suche:${portalName}:${kriterien.bezirk ?? 'gesamt'}:${kriterien.typ}:${band}` +
          `:seiten=${optionen?.maxSeiten}`,
      );
      if (verhalten.fehler) return Promise.reject(new PortalFehler(`${portalName} down`));
      const { anzahl, gesamtTreffer } = verhalten.antwort?.(kriterien) ?? {
        anzahl: 1,
        gesamtTreffer: 1,
      };
      const typ = kriterien.typ === 'beide' ? 'kauf' : kriterien.typ;
      const inserate = Array.from({ length: anzahl }, () =>
        inserat(`${portalName}-${(laufendeNr += 1)}`, typ),
      );
      return Promise.resolve([{ typ, inserate, uebersprungen: 0, gesamtTreffer }]);
    },
  };
}

interface FakeZustand {
  aufrufe: string[];
  /** Segmente, die als „heute schon fertig" gelten. */
  fertige?: SweepSegmentKey[];
  /** Sweep-Claim geht leer aus (heute schon gesweept). */
  nichtClaimbar?: boolean;
}

function fakeDeps(zustand: FakeZustand): SweepDeps {
  let naechsteSegmentId = 500;
  const segmentZuKey = new Map<number, string>();
  return {
    sweepBeanspruchen: (datum) => {
      zustand.aufrufe.push(`sweep-claim:${datum}${zustand.nichtClaimbar ? ':leer' : ''}`);
      return Promise.resolve(zustand.nichtClaimbar ? undefined : 1);
    },
    sweepAbschliessen: (_id, gesehen) => {
      zustand.aufrufe.push(`sweep-fertig:${gesehen}`);
      return Promise.resolve();
    },
    sweepFehlgeschlagen: (_id, meldung) => {
      zustand.aufrufe.push(`sweep-fehlgeschlagen:${meldung}`);
      return Promise.resolve();
    },
    segmentBeanspruchen: (_datum, key) => {
      const id = naechsteSegmentId++;
      segmentZuKey.set(id, segmentSchluessel(key));
      zustand.aufrufe.push(`segment-claim:${segmentSchluessel(key)}`);
      return Promise.resolve(id);
    },
    segmentAbschliessen: (id) => {
      zustand.aufrufe.push(`segment-fertig:${segmentZuKey.get(id)}`);
      return Promise.resolve();
    },
    segmentFehlgeschlagen: (id) => {
      zustand.aufrufe.push(`segment-fehlgeschlagen:${segmentZuKey.get(id)}`);
      return Promise.resolve();
    },
    fertigeSegmente: () => Promise.resolve(new Set((zustand.fertige ?? []).map(segmentSchluessel))),
    bestandUpsert: (inserate, bundesland) => {
      zustand.aufrufe.push(`upsert:${inserate.length}:${bundesland}`);
      return Promise.resolve({ neu: inserate.length, preisAenderungen: 0 });
    },
    objekteZuordnen: () => {
      zustand.aufrufe.push('objekte-zuordnen');
      return Promise.resolve({ neueObjekte: 0, zugeordnet: 0 });
    },
    mitCrawlSperre: (fn) => fn(),
    heute: () => '2026-07-07',
    warte: () => Promise.resolve(),
    segmentPauseMs: 0,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('basisSegmente', () => {
  it('nimmt alle 10 Bezirke (alle Slugs verifiziert), kein Rest-Segment nötig', () => {
    const segmente = basisSegmente('willhaben.at');
    const bezirke = [...new Set(segmente.map((s) => s.bezirk))];
    expect(bezirke).toHaveLength(10);
    expect(bezirke).not.toContain('gesamt');
    // Jeder Bezirk in Kauf und Miete:
    expect(segmente).toHaveLength(20);
    expect(segmente.filter((s) => s.typ === 'kauf')).toHaveLength(10);
  });

  it('unbekanntes Portal fällt komplett auf das Rest-Segment zurück', () => {
    expect(basisSegmente('zukunft.at')).toEqual([
      { bezirk: 'gesamt', typ: 'kauf' },
      { bezirk: 'gesamt', typ: 'miete' },
    ]);
  });
});

describe('preisBaender', () => {
  it('liefert auf Tiefe 0 die festen Typ-Bänder (lückenlos, offen an den Rändern)', () => {
    expect(preisBaender('kauf', {}, 0)).toEqual([
      { preisMax: 150000 },
      { preisMin: 150000, preisMax: 250000 },
      { preisMin: 250000, preisMax: 400000 },
      { preisMin: 400000 },
    ]);
    expect(preisBaender('miete', {}, 0)).toEqual([
      { preisMax: 700 },
      { preisMin: 700, preisMax: 1000 },
      { preisMin: 1000, preisMax: 1400 },
      { preisMin: 1400 },
    ]);
  });

  it('halbiert ein begrenztes Band in der Mitte', () => {
    expect(preisBaender('kauf', { preisMin: 150000, preisMax: 250000 }, 1)).toEqual([
      { preisMin: 150000, preisMax: 200000 },
      { preisMin: 200000, preisMax: 250000 },
    ]);
  });

  it('teilt offene Rand-Bänder durch Verdoppeln/Halbieren der bekannten Grenze', () => {
    expect(preisBaender('kauf', { preisMax: 150000 }, 1)).toEqual([
      { preisMax: 75000 },
      { preisMin: 75000, preisMax: 150000 },
    ]);
    expect(preisBaender('kauf', { preisMin: 400000 }, 1)).toEqual([
      { preisMin: 400000, preisMax: 800000 },
      { preisMin: 800000 },
    ]);
  });
});

describe('fuehreSweepAus', () => {
  it('tut nichts, wenn der heutige Sweep schon beansprucht ist', async () => {
    const zustand: FakeZustand = { aufrufe: [], nichtClaimbar: true };
    const gestartet = await fuehreSweepAus([fakePortal('willhaben.at', zustand.aufrufe)], fakeDeps(zustand));

    expect(gestartet).toBe(false);
    expect(zustand.aufrufe).toEqual(['sweep-claim:2026-07-07:leer']);
  });

  it('crawlt alle Segmente beider Portale und schließt den Sweep ab', async () => {
    const zustand: FakeZustand = { aufrufe: [] };
    const portale = [
      fakePortal('willhaben.at', zustand.aufrufe),
      fakePortal('immoscout24.at', zustand.aufrufe),
    ];
    await fuehreSweepAus(portale, fakeDeps(zustand));

    // Je Portal: 10 Bezirke × 2 Typen = 20 Segmente.
    const claims = zustand.aufrufe.filter((a) => a.startsWith('segment-claim:'));
    expect(claims).toHaveLength(40);
    expect(zustand.aufrufe.filter((a) => a.startsWith('segment-fertig:'))).toHaveLength(40);
    // Jedes Segment upserted sofort; der Sweep summiert die geladenen Inserate.
    expect(zustand.aufrufe.filter((a) => a === 'upsert:1:kaernten')).toHaveLength(40);
    // Nach dem letzten Segment läuft das Objekt-Matching, dann schließt der Sweep.
    expect(zustand.aufrufe.at(-2)).toBe('objekte-zuordnen');
    expect(zustand.aufrufe.at(-1)).toBe('sweep-fertig:40');
    // Der Sweep crawlt mit erhöhtem Seiten-Deckel.
    expect(zustand.aufrufe.some((a) => a.includes('seiten=15'))).toBe(true);
  });

  it('überspringt heute schon fertige Segmente (Resume nach Neustart)', async () => {
    const zustand: FakeZustand = {
      aufrufe: [],
      fertige: [
        { portal: 'willhaben.at', bezirk: 'klagenfurt-stadt', typ: 'kauf' },
        { portal: 'willhaben.at', bezirk: 'klagenfurt-stadt', typ: 'miete' },
      ],
    };
    await fuehreSweepAus([fakePortal('willhaben.at', zustand.aufrufe)], fakeDeps(zustand));

    const claims = zustand.aufrufe.filter((a) => a.startsWith('segment-claim:'));
    expect(claims).toHaveLength(18); // 20 Basis-Segmente − 2 fertige
    expect(claims.some((a) => a.includes('klagenfurt-stadt'))).toBe(false);
    expect(zustand.aufrufe.at(-1)).toBe('sweep-fertig:18');
  });

  it('zerlegt ein gesättigtes Segment in Preisbänder, bevor es fertig wird', async () => {
    const zustand: FakeZustand = { aufrufe: [] };
    const portal = fakePortal('willhaben.at', zustand.aufrufe, {
      antwort: (kriterien) => {
        // Nur das ungebänderte Kauf-Segment von Klagenfurt sättigt.
        const gesaettigt =
          kriterien.bezirk === 'klagenfurt-stadt' &&
          kriterien.typ === 'kauf' &&
          kriterien.preisMin === undefined &&
          kriterien.preisMax === undefined;
        return gesaettigt ? { anzahl: 2, gesamtTreffer: 500 } : { anzahl: 1, gesamtTreffer: 1 };
      },
    });
    await fuehreSweepAus([portal], fakeDeps(zustand));

    // Eltern-Segment wird erst nach seinen 4 Band-Kindern abgeschlossen.
    const relevante = zustand.aufrufe.filter(
      (a) => a.includes('klagenfurt-stadt|kauf') && !a.startsWith('suche:'),
    );
    expect(relevante).toEqual([
      'segment-claim:willhaben.at|klagenfurt-stadt|kauf||',
      'segment-claim:willhaben.at|klagenfurt-stadt|kauf||150000',
      'segment-fertig:willhaben.at|klagenfurt-stadt|kauf||150000',
      'segment-claim:willhaben.at|klagenfurt-stadt|kauf|150000|250000',
      'segment-fertig:willhaben.at|klagenfurt-stadt|kauf|150000|250000',
      'segment-claim:willhaben.at|klagenfurt-stadt|kauf|250000|400000',
      'segment-fertig:willhaben.at|klagenfurt-stadt|kauf|250000|400000',
      'segment-claim:willhaben.at|klagenfurt-stadt|kauf|400000|',
      'segment-fertig:willhaben.at|klagenfurt-stadt|kauf|400000|',
      'segment-fertig:willhaben.at|klagenfurt-stadt|kauf||',
    ]);
    // Das gesättigte Eltern-Segment upserted 2 Inserate, jedes Kind 1.
    expect(zustand.aufrufe.filter((a) => a === 'upsert:2:kaernten')).toHaveLength(1);
  });

  it('hört bei maximaler Band-Tiefe auf zu splitten', async () => {
    const zustand: FakeZustand = { aufrufe: [] };
    // Alles ist immer gesättigt — der Split muss trotzdem terminieren.
    const portal = fakePortal('willhaben.at', zustand.aufrufe, {
      antwort: () => ({ anzahl: 1, gesamtTreffer: 10_000 }),
    });
    await fuehreSweepAus([portal], fakeDeps(zustand));

    // Tiefe 0 (1) + Tiefe 1 (4 Bänder) + je 2 Halbierungen auf Tiefe 2 (8)
    // + Tiefe 3 (16) = 29 Segmente pro Basis-Segment; 20 Basis-Segmente.
    const claims = zustand.aufrufe.filter((a) => a.startsWith('segment-claim:'));
    expect(claims).toHaveLength(29 * 20);
    expect(zustand.aufrufe.at(-1)).toBe(`sweep-fertig:${29 * 20}`);
  });

  it('ein ausgefallenes Portal degradiert nur dessen Segmente', async () => {
    const zustand: FakeZustand = { aufrufe: [] };
    const portale = [
      fakePortal('willhaben.at', zustand.aufrufe, { fehler: true }),
      fakePortal('immoscout24.at', zustand.aufrufe),
    ];
    await fuehreSweepAus(portale, fakeDeps(zustand));

    expect(zustand.aufrufe.filter((a) => a.startsWith('segment-fehlgeschlagen:'))).toHaveLength(20);
    expect(zustand.aufrufe.filter((a) => a.startsWith('segment-fertig:'))).toHaveLength(20);
    expect(zustand.aufrufe.at(-1)).toBe('sweep-fertig:20');
  });

  it('der Sweep scheitert erst, wenn kein Segment durchkommt', async () => {
    const zustand: FakeZustand = { aufrufe: [] };
    const portale = [
      fakePortal('willhaben.at', zustand.aufrufe, { fehler: true }),
      fakePortal('immoscout24.at', zustand.aufrufe, { fehler: true }),
    ];
    await fuehreSweepAus(portale, fakeDeps(zustand));

    expect(zustand.aufrufe.at(-1)).toMatch(/^sweep-fehlgeschlagen:Kein Segment abfragbar/);
  });
});
