import { describe, expect, it } from 'vitest';
import { ImmoScout24Adapter, ImmoScout24Fehler } from '../src/adapters/immoscout24-adapter.js';

function macheHit(exposeId: string): unknown {
  return {
    exposeId,
    links: { absoluteURL: `https://www.immobilienscout24.at/expose/${exposeId}` },
    addressString: '9500 Villach',
    primaryPrice: 200000,
    primaryArea: 70,
    numberOfRooms: 3,
    dateCreated: '2026-07-01T10:00:00.000Z',
  };
}

/** Baut eine Seite mit den echten Eigenheiten: bare undefined + Statements nach dem Objekt. */
function macheSeite(exposeIds: string[], totalHits: number): string {
  const results = JSON.stringify({ totalHits, pagination: { all: [] }, hits: exposeIds.map(macheHit) });
  const state = `{"searchUI":{"totalHits":${totalHits},"aggregations":undefined},"reduxAsyncConnect":{"pageData":{"results":${results}}}}`;
  return `<html><body><script>window.__INITIAL_STATE__ = ${state};\nwindow.E2E_MODE = false;</script></body></html>`;
}

/** Fake-fetch: liefert pro /seite-N-Pfad die vorbereitete Seite (ohne Suffix: Seite 1). */
function fakeFetch(seiten: Record<string, string>, aufrufe: string[] = []): typeof fetch {
  return (async (eingabe: string | URL | Request) => {
    const url = new URL(String(eingabe));
    aufrufe.push(url.toString());
    const seite = /\/seite-(\d+)$/.exec(url.pathname)?.[1] ?? '1';
    const html = seiten[seite];
    if (!html) throw new Error(`Fake-Fetch: keine Seite ${seite} vorbereitet.`);
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
}

const KAUF_URL = 'https://www.immoscout24.at/regional/kaernten/wohnung-kaufen';
const MIETE_URL = 'https://www.immoscout24.at/regional/kaernten/wohnung-mieten';

function ids(anzahl: number, ab: number): string[] {
  return Array.from({ length: anzahl }, (_, i) => String(1000 + ab + i));
}

describe('ImmoScout24Adapter', () => {
  it('canHandle akzeptiert immoscout24-URLs und sonst nichts', () => {
    const adapter = new ImmoScout24Adapter();
    expect(adapter.canHandle(KAUF_URL)).toBe(true);
    expect(adapter.canHandle('https://immoscout24.at/regional/wien/wohnung-mieten')).toBe(true);
    expect(adapter.canHandle('daten/inserate.csv')).toBe(false);
    expect(adapter.canHandle('https://www.willhaben.at/iad/immobilien/eigentumswohnung/kaernten')).toBe(false);
  });

  it('paginiert per /seite-N bis totalHits erreicht ist und hört dann auf', async () => {
    const aufrufe: string[] = [];
    const adapter = new ImmoScout24Adapter(
      fakeFetch(
        { '1': macheSeite(ids(15, 0), 35), '2': macheSeite(ids(15, 15), 35), '3': macheSeite(ids(5, 30), 35) },
        aufrufe,
      ),
      0,
    );
    const ergebnis = await adapter.fetchMitStatistik(`${KAUF_URL}?primaryPriceTo=300000`);
    expect(aufrufe).toHaveLength(3);
    expect(ergebnis.inserate).toHaveLength(35);
    expect(ergebnis.gesamtTreffer).toBe(35);
    // Seite 1 ohne Suffix, Folgeseiten mit; Query-Parameter bleiben erhalten.
    expect(new URL(aufrufe[0]!).pathname).toBe('/regional/kaernten/wohnung-kaufen');
    expect(new URL(aufrufe[2]!).pathname).toBe('/regional/kaernten/wohnung-kaufen/seite-3');
    expect(new URL(aufrufe[2]!).searchParams.get('primaryPriceTo')).toBe('300000');
  });

  it('lädt bei einer nicht vollen ersten Seite keine weitere', async () => {
    const aufrufe: string[] = [];
    const adapter = new ImmoScout24Adapter(fakeFetch({ '1': macheSeite(ids(8, 0), 8) }, aufrufe), 0);
    const ergebnis = await adapter.fetchMitStatistik(KAUF_URL);
    expect(aufrufe).toHaveLength(1);
    expect(ergebnis.inserate).toHaveLength(8);
  });

  it('dedupliziert beworbene Inserate und setzt das Bundesland als Bezirk', async () => {
    const seite1 = ids(15, 0);
    const seite2 = [...ids(13, 15), seite1[0]!, seite1[1]!]; // 2 Wiederholungen
    const adapter = new ImmoScout24Adapter(
      fakeFetch({ '1': macheSeite(seite1, 30), '2': macheSeite(seite2, 30) }),
      0,
    );
    const ergebnis = await adapter.fetchMitStatistik(KAUF_URL);
    expect(ergebnis.inserate).toHaveLength(28);
    expect(new Set(ergebnis.inserate.map((i) => i.id)).size).toBe(28);
    expect(ergebnis.inserate[0]!.bezirk).toBe('Kärnten');
  });

  it('paginiert Ort-URLs hinter dem Kategorie-Segment und behält das Bundesland als Bezirk', async () => {
    const aufrufe: string[] = [];
    const adapter = new ImmoScout24Adapter(
      fakeFetch({ '1': macheSeite(ids(15, 0), 20), '2': macheSeite(ids(5, 15), 20) }, aufrufe),
      0,
    );
    const ergebnis = await adapter.fetchMitStatistik(
      'https://www.immoscout24.at/regional/kaernten/villach/wohnung-kaufen?primaryAreaFrom=60',
    );
    expect(new URL(aufrufe[1]!).pathname).toBe('/regional/kaernten/villach/wohnung-kaufen/seite-2');
    expect(new URL(aufrufe[1]!).searchParams.get('primaryAreaFrom')).toBe('60');
    expect(ergebnis.inserate[0]!.bezirk).toBe('Kärnten');
  });

  it('leitet den Inserat-Typ aus dem URL-Pfad ab', async () => {
    const adapter = new ImmoScout24Adapter(fakeFetch({ '1': macheSeite(ids(3, 0), 3) }), 0);
    const miete = await adapter.fetch(MIETE_URL);
    expect(miete.every((i) => i.typ === 'miete')).toBe(true);
    await expect(
      adapter.fetchMitStatistik('https://www.immoscout24.at/regional/kaernten/haus-kaufen'),
    ).rejects.toThrow(ImmoScout24Fehler);
  });

  it('wirft ImmoScout24Fehler bei HTTP-Fehlern und Netzwerkproblemen', async () => {
    const blockiert = (async () => new Response('blocked', { status: 403 })) as typeof fetch;
    await expect(new ImmoScout24Adapter(blockiert, 0).fetch(KAUF_URL)).rejects.toThrow(/HTTP 403/);

    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(new ImmoScout24Adapter(offline, 0).fetch(KAUF_URL)).rejects.toThrow(ImmoScout24Fehler);
  });

  it('sucheMitStatistik crawlt bei typ=beide Kauf- und Miet-URL', async () => {
    const aufrufe: string[] = [];
    const fetchFn = (async (eingabe: string | URL | Request) => {
      const url = new URL(String(eingabe));
      aufrufe.push(url.toString());
      const kauf = url.pathname.includes('wohnung-kaufen');
      return new Response(macheSeite(kauf ? ['k1'] : ['m1'], 1), { status: 200 });
    }) as typeof fetch;

    const ergebnisse = await new ImmoScout24Adapter(fetchFn, 0).sucheMitStatistik({
      bundesland: 'kaernten',
      typ: 'beide',
      preisMax: 300000,
    });
    expect(ergebnisse.map((e) => e.typ)).toEqual(['kauf', 'miete']);
    expect(ergebnisse[0]!.inserate[0]!.id).toBe('is24-k1');
    expect(ergebnisse[1]!.inserate[0]!.typ).toBe('miete');
    expect(ergebnisse[0]!.gesamtTreffer).toBe(1);
    // Preisfilter nur an der Kauf-URL
    expect(new URL(aufrufe[0]!).searchParams.get('primaryPriceTo')).toBe('300000');
    expect(new URL(aufrufe[1]!).searchParams.get('primaryPriceTo')).toBeNull();
  });
});
