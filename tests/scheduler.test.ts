import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalFehler } from '../src/adapters/portal-adapter.js';
import type { Gebiet } from '../src/db/gebiete-repo.js';
import { crawlAlleGebiete, starteGebietCrawl, type SchedulerDeps } from '../src/scheduler.js';
import type { SuchKriterien } from '../src/search.js';
import type { CrawlErgebnis } from '../src/suchlauf.js';
import type { InseratMitPortal } from '../src/types.js';

function gebiet(id: number, kriterien: Partial<SuchKriterien> = {}): Gebiet {
  return {
    id,
    name: `Gebiet ${id}`,
    kriterien: { bundesland: 'kaernten', typ: 'beide', ...kriterien },
    aktiv: true,
    erstelltAm: new Date('2026-07-01T08:00:00Z'),
  };
}

function inserat(id: string): InseratMitPortal {
  return {
    id,
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis: 200000,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-07-03',
  };
}

interface FakeVerhalten {
  gebiete: Gebiet[];
  /** Gebiet-IDs, deren Claim leer ausgeht (heute schon gecrawlt). */
  nichtClaimbar?: number[];
  /** Gebiet-IDs, deren Crawl scheitert. */
  crawlFehler?: number[];
}

function fakeDeps(verhalten: FakeVerhalten, aufrufe: string[]): SchedulerDeps {
  let crawlGebietId = 0;
  let laufZuGebiet = new Map<number, number>();
  let naechsteLaufId = 100;
  return {
    gebieteAuflisten: (nurAktive) => {
      aufrufe.push(`auflisten:${nurAktive}`);
      return Promise.resolve(verhalten.gebiete);
    },
    crawlLaufBeanspruchen: (gebietId) => {
      if (verhalten.nichtClaimbar?.includes(gebietId)) {
        aufrufe.push(`claim:${gebietId}:leer`);
        return Promise.resolve(undefined);
      }
      const laufId = naechsteLaufId++;
      laufZuGebiet.set(laufId, gebietId);
      crawlGebietId = gebietId;
      aufrufe.push(`claim:${gebietId}:${laufId}`);
      return Promise.resolve(laufId);
    },
    crawlLaufErzwingen: (gebietId) => {
      if (verhalten.nichtClaimbar?.includes(gebietId)) {
        aufrufe.push(`erzwingen:${gebietId}:leer`);
        return Promise.resolve(undefined);
      }
      const laufId = naechsteLaufId++;
      laufZuGebiet.set(laufId, gebietId);
      crawlGebietId = gebietId;
      aufrufe.push(`erzwingen:${gebietId}:${laufId}`);
      return Promise.resolve(laufId);
    },
    crawlePortale: (_portale, kriterien) => {
      aufrufe.push(`crawl:${crawlGebietId}:typ=${kriterien.typ}`);
      if (verhalten.crawlFehler?.includes(crawlGebietId)) {
        return Promise.reject(new PortalFehler('Timeout'));
      }
      const ergebnis: CrawlErgebnis = {
        inserate: [inserat(`wh-${crawlGebietId}`)],
        quellen: ['quelle'],
      };
      return Promise.resolve(ergebnis);
    },
    bestandUpsert: (inserate, bundesland) => {
      aufrufe.push(`upsert:${inserate.length}:${bundesland}`);
      return Promise.resolve({ neu: inserate.length, preisAenderungen: 0 });
    },
    crawlLaufAbschliessen: (laufId, _quellen, gesehen) => {
      aufrufe.push(`fertig:${laufZuGebiet.get(laufId)}:${gesehen}`);
      return Promise.resolve();
    },
    crawlLaufFehlgeschlagen: (laufId, meldung) => {
      aufrufe.push(`fehlgeschlagen:${laufZuGebiet.get(laufId)}:${meldung}`);
      return Promise.resolve();
    },
    mitCrawlSperre: (fn) => fn(),
    heute: () => '2026-07-03',
  };
}

beforeEach(() => {
  // Erfolgs- und Fehlerpfade loggen bewusst – Test-Output sauber halten
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('crawlAlleGebiete', () => {
  it('crawlt aktive Gebiete sequenziell und schließt die Läufe ab', async () => {
    const aufrufe: string[] = [];
    await crawlAlleGebiete([], fakeDeps({ gebiete: [gebiet(1), gebiet(2)] }, aufrufe));

    expect(aufrufe).toEqual([
      'auflisten:true',
      'claim:1:100',
      'crawl:1:typ=beide',
      'upsert:1:kaernten',
      'fertig:1:1',
      'claim:2:101',
      'crawl:2:typ=beide',
      'upsert:1:kaernten',
      'fertig:2:1',
    ]);
  });

  it('überspringt Gebiete ohne Claim (heute schon gecrawlt)', async () => {
    const aufrufe: string[] = [];
    await crawlAlleGebiete(
      [],
      fakeDeps({ gebiete: [gebiet(1), gebiet(2)], nichtClaimbar: [1] }, aufrufe),
    );

    expect(aufrufe).toEqual([
      'auflisten:true',
      'claim:1:leer',
      'claim:2:100',
      'crawl:2:typ=beide',
      'upsert:1:kaernten',
      'fertig:2:1',
    ]);
  });

  it('ein fehlgeschlagenes Gebiet stoppt die anderen nicht', async () => {
    const aufrufe: string[] = [];
    await crawlAlleGebiete(
      [],
      fakeDeps({ gebiete: [gebiet(1), gebiet(2)], crawlFehler: [1] }, aufrufe),
    );

    expect(aufrufe).toEqual([
      'auflisten:true',
      'claim:1:100',
      'crawl:1:typ=beide',
      'fehlgeschlagen:1:Timeout',
      'claim:2:101',
      'crawl:2:typ=beide',
      'upsert:1:kaernten',
      'fertig:2:1',
    ]);
  });

  it('erzwingt typ=beide auch bei Gebieten mit Typ kauf/miete', async () => {
    const aufrufe: string[] = [];
    await crawlAlleGebiete([], fakeDeps({ gebiete: [gebiet(1, { typ: 'miete' })] }, aufrufe));

    expect(aufrufe).toContain('crawl:1:typ=beide');
  });
});

describe('starteGebietCrawl', () => {
  it('erzwingt den Lauf und crawlt im Hintergrund', async () => {
    const aufrufe: string[] = [];
    const gestartet = await starteGebietCrawl(gebiet(1), [], fakeDeps({ gebiete: [] }, aufrufe));

    expect(gestartet).toBe(true);
    await new Promise((r) => setTimeout(r, 0)); // Hintergrund-Crawl abwarten
    expect(aufrufe).toEqual(['erzwingen:1:100', 'crawl:1:typ=beide', 'upsert:1:kaernten', 'fertig:1:1']);
  });

  it('startet nichts, wenn der Lauf gerade läuft', async () => {
    const aufrufe: string[] = [];
    const gestartet = await starteGebietCrawl(
      gebiet(1),
      [],
      fakeDeps({ gebiete: [], nichtClaimbar: [1] }, aufrufe),
    );

    expect(gestartet).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(aufrufe).toEqual(['erzwingen:1:leer']);
  });

  it('markiert den Lauf bei einem Crawl-Fehler als fehlgeschlagen', async () => {
    const aufrufe: string[] = [];
    await starteGebietCrawl(gebiet(1), [], fakeDeps({ gebiete: [], crawlFehler: [1] }, aufrufe));

    await new Promise((r) => setTimeout(r, 0));
    expect(aufrufe).toEqual(['erzwingen:1:100', 'crawl:1:typ=beide', 'fehlgeschlagen:1:Timeout']);
  });
});
