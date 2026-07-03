import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PortalFehler,
  type PortalAdapter,
  type PortalSuchErgebnis,
} from '../src/adapters/portal-adapter.js';
import { crawlePortale, mitCrawlSperre, starteSuchlauf, type SuchlaufDeps } from '../src/suchlauf.js';
import type { SuchKriterien } from '../src/search.js';
import type { Inserat } from '../src/types.js';

const KRITERIEN: SuchKriterien = { bundesland: 'kaernten', typ: 'beide' };

function inserat(id: string): Inserat {
  return {
    id,
    typ: 'kauf',
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis: 200000,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-07-02',
  };
}

function fakePortal(portal: string, ergebnisse: PortalSuchErgebnis[] | Error): PortalAdapter {
  return {
    name: portal,
    portal,
    canHandle: () => false,
    fetch: () => Promise.reject(new Error('nicht benutzt')),
    sucheMitStatistik: () =>
      ergebnisse instanceof Error ? Promise.reject(ergebnisse) : Promise.resolve(ergebnisse),
  };
}

function ergebnis(inserate: Inserat[], uebersprungen = 0): PortalSuchErgebnis {
  return { typ: 'kauf', inserate, uebersprungen, gesamtTreffer: inserate.length + uebersprungen };
}

describe('crawlePortale', () => {
  it('kombiniert Inserate aller Portale und dedupliziert pro Portal-ID', async () => {
    const a = fakePortal('portal-a', [ergebnis([inserat('X1'), inserat('X1'), inserat('X2')])]);
    const b = fakePortal('portal-b', [ergebnis([inserat('Y1')])]);

    const { inserate, quellen } = await crawlePortale([a, b], KRITERIEN);
    expect(inserate.map((i) => i.id)).toEqual(['X1', 'X2', 'Y1']);
    expect(quellen).toHaveLength(2);
    expect(quellen[0]).toContain('portal-a Kärnten');
  });

  it('stempelt jedes Inserat mit dem Herkunftsportal', async () => {
    const a = fakePortal('portal-a', [ergebnis([inserat('X1')])]);
    const b = fakePortal('portal-b', [ergebnis([inserat('Y1')])]);

    const { inserate } = await crawlePortale([a, b], KRITERIEN);
    expect(inserate.map((i) => i.portal)).toEqual(['portal-a', 'portal-b']);
  });

  it('degradiert ein ausgefallenes Portal zu einer Quellen-Zeile', async () => {
    const kaputt = fakePortal('portal-a', new PortalFehler('Timeout'));
    const ok = fakePortal('portal-b', [ergebnis([inserat('Y1')], 2)]);

    const { inserate, quellen } = await crawlePortale([kaputt, ok], KRITERIEN);
    expect(inserate.map((i) => i.id)).toEqual(['Y1']);
    expect(quellen[0]).toContain('nicht abfragbar (Timeout)');
    expect(quellen[1]).toContain('2 ohne verwertbare Daten');
  });

  it('wirft den ersten PortalFehler, wenn alle Portale scheitern', async () => {
    const a = fakePortal('portal-a', new PortalFehler('Timeout A'));
    const b = fakePortal('portal-b', new PortalFehler('Timeout B'));

    await expect(crawlePortale([a, b], KRITERIEN)).rejects.toThrow('Timeout A');
  });

  it('reicht unerwartete Fehler unverändert durch', async () => {
    const a = fakePortal('portal-a', new TypeError('kaputt'));
    await expect(crawlePortale([a], KRITERIEN)).rejects.toThrow(TypeError);
  });
});

describe('mitCrawlSperre', () => {
  it('serialisiert überlappende Crawls FIFO', async () => {
    const reihenfolge: string[] = [];
    let ersterFertig!: () => void;
    const erster = mitCrawlSperre(
      () =>
        new Promise<void>((resolve) => {
          reihenfolge.push('A start');
          ersterFertig = () => {
            reihenfolge.push('A ende');
            resolve();
          };
        }),
    );
    const zweiter = mitCrawlSperre(async () => {
      reihenfolge.push('B start');
    });

    await new Promise((r) => setTimeout(r, 0)); // erster Crawl läuft an, zweiter muss warten
    expect(reihenfolge).toEqual(['A start']);
    ersterFertig();
    await Promise.all([erster, zweiter]);
    expect(reihenfolge).toEqual(['A start', 'A ende', 'B start']);
  });

  it('bricht die Kette nicht, wenn ein Vorgänger scheitert', async () => {
    await expect(mitCrawlSperre(() => Promise.reject(new Error('kaputt')))).rejects.toThrow('kaputt');
    await expect(mitCrawlSperre(async () => 42)).resolves.toBe(42);
  });
});

describe('starteSuchlauf', () => {
  beforeEach(() => {
    // Fehlerpfade loggen bewusst per console.error – Test-Output sauber halten
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  function fakeDeps(aufrufe: string[], upsertFehler?: Error): SuchlaufDeps {
    return {
      bestandUpsert: (inserate) => {
        aufrufe.push(`upsert:${inserate.length}`);
        return upsertFehler
          ? Promise.reject(upsertFehler)
          : Promise.resolve({ neu: inserate.length, preisAenderungen: 0 });
      },
      sucheAbschliessen: (id, _quellen, treffer) => {
        aufrufe.push(`abschliessen:${id}:${treffer.length}`);
        return Promise.resolve();
      },
      sucheFehlgeschlagen: (id, meldung) => {
        aufrufe.push(`fehlgeschlagen:${id}:${meldung}`);
        return Promise.resolve();
      },
      heute: () => '2026-07-03',
    };
  }

  it('schreibt ungefiltert in den Bestand und gefiltert an die Suche', async () => {
    const aufrufe: string[] = [];
    const portal = fakePortal('portal-a', [
      ergebnis([inserat('X1'), { ...inserat('X2'), flaeche_m2: 20 }]),
    ]);

    await starteSuchlauf(7, { ...KRITERIEN, flaecheMin: 50 }, [portal], fakeDeps(aufrufe));
    expect(aufrufe).toEqual(['upsert:2', 'abschliessen:7:1']);
  });

  it('lässt die Suche bei einem Bestand-Upsert-Fehler nicht scheitern', async () => {
    const aufrufe: string[] = [];
    const portal = fakePortal('portal-a', [ergebnis([inserat('X1')])]);

    await starteSuchlauf(7, KRITERIEN, [portal], fakeDeps(aufrufe, new Error('DB weg')));
    expect(aufrufe).toEqual(['upsert:1', 'abschliessen:7:1']);
  });

  it('markiert die Suche als fehlgeschlagen, wenn alle Portale scheitern', async () => {
    const aufrufe: string[] = [];
    const portal = fakePortal('portal-a', new PortalFehler('Timeout'));

    await starteSuchlauf(7, KRITERIEN, [portal], fakeDeps(aufrufe));
    expect(aufrufe).toEqual(['fehlgeschlagen:7:Kein Portal ist gerade abfragbar: Timeout']);
  });
});
