import { describe, expect, it } from 'vitest';
import { WillhabenAdapter, WillhabenFehler } from '../src/adapters/willhaben-adapter.js';

function macheAd(adid: string): unknown {
  const attribute = [
    { name: 'ADID', values: [adid] },
    { name: 'LOCATION', values: ['Villach'] },
    { name: 'POSTCODE', values: ['9500'] },
    { name: 'DISTRICT', values: ['Villach Stadt'] },
    { name: 'PRICE', values: ['200000'] },
    { name: 'ESTATE_SIZE/LIVING_AREA', values: ['70'] },
    { name: 'NUMBER_OF_ROOMS', values: ['3'] },
    { name: 'SEO_URL', values: [`immobilien/d/eigentumswohnung/kaernten/test-${adid}/`] },
    { name: 'PUBLISHED_String', values: ['2026-07-01T10:00:00Z'] },
  ];
  return { attributes: { attribute } };
}

function macheSeite(adids: string[], rowsFound: number): string {
  const nextData = {
    props: {
      pageProps: {
        searchResult: {
          rowsFound,
          rowsReturned: adids.length,
          advertSummaryList: { advertSummary: adids.map(macheAd) },
        },
      },
    },
  };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

/** Fake-fetch: liefert pro page-Parameter die vorbereitete Seite. */
function fakeFetch(seiten: Record<string, string>, aufrufe: string[] = []): typeof fetch {
  return (async (eingabe: string | URL | Request) => {
    const url = new URL(String(eingabe));
    aufrufe.push(url.toString());
    const html = seiten[url.searchParams.get('page') ?? '1'];
    if (!html) throw new Error(`Fake-Fetch: keine Seite ${url.searchParams.get('page')} vorbereitet.`);
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
}

const KAUF_URL = 'https://www.willhaben.at/iad/immobilien/eigentumswohnung/kaernten';
const MIETE_URL = 'https://www.willhaben.at/iad/immobilien/mietwohnungen/kaernten';

function ids(anzahl: number, ab: number): string[] {
  return Array.from({ length: anzahl }, (_, i) => String(1000 + ab + i));
}

describe('WillhabenAdapter', () => {
  it('canHandle akzeptiert willhaben-URLs und sonst nichts', () => {
    const adapter = new WillhabenAdapter();
    expect(adapter.canHandle(KAUF_URL)).toBe(true);
    expect(adapter.canHandle('https://willhaben.at/iad/x')).toBe(true);
    expect(adapter.canHandle('daten/inserate.csv')).toBe(false);
    expect(adapter.canHandle('https://www.immoscout24.at/regional/kaernten')).toBe(false);
  });

  it('paginiert bis rowsFound erreicht ist und hört dann auf', async () => {
    const aufrufe: string[] = [];
    const adapter = new WillhabenAdapter(
      fakeFetch({ '1': macheSeite(ids(30, 0), 65), '2': macheSeite(ids(30, 30), 65), '3': macheSeite(ids(5, 60), 65) }, aufrufe),
      0,
    );
    const ergebnis = await adapter.fetchMitStatistik(KAUF_URL);
    expect(aufrufe).toHaveLength(3);
    expect(ergebnis.inserate).toHaveLength(65);
    expect(ergebnis.rowsFound).toBe(65);
    expect(new URL(aufrufe[2]!).searchParams.get('page')).toBe('3');
  });

  it('lädt bei einer nicht vollen ersten Seite keine weitere', async () => {
    const aufrufe: string[] = [];
    const adapter = new WillhabenAdapter(fakeFetch({ '1': macheSeite(ids(12, 0), 12) }, aufrufe), 0);
    const ergebnis = await adapter.fetchMitStatistik(KAUF_URL);
    expect(aufrufe).toHaveLength(1);
    expect(ergebnis.inserate).toHaveLength(12);
  });

  it('dedupliziert beworbene Inserate, die auf mehreren Seiten auftauchen', async () => {
    const seite1 = ids(30, 0);
    const seite2 = [...ids(28, 30), seite1[0]!, seite1[1]!]; // 2 Wiederholungen
    const adapter = new WillhabenAdapter(
      fakeFetch({ '1': macheSeite(seite1, 60), '2': macheSeite(seite2, 60) }),
      0,
    );
    const ergebnis = await adapter.fetchMitStatistik(KAUF_URL);
    expect(ergebnis.inserate).toHaveLength(58);
    const eindeutig = new Set(ergebnis.inserate.map((i) => i.id));
    expect(eindeutig.size).toBe(58);
  });

  it('leitet den Inserat-Typ aus dem URL-Pfad ab', async () => {
    const adapter = new WillhabenAdapter(fakeFetch({ '1': macheSeite(ids(3, 0), 3) }), 0);
    const miete = await adapter.fetch(MIETE_URL);
    expect(miete.every((i) => i.typ === 'miete')).toBe(true);
    await expect(
      adapter.fetchMitStatistik('https://www.willhaben.at/iad/immobilien/haus-kaufen/kaernten'),
    ).rejects.toThrow(WillhabenFehler);
  });

  it('sucheMitStatistik crawlt bei typ=beide Kauf- und Miet-URL', async () => {
    const aufrufe: string[] = [];
    const adapter = new WillhabenAdapter(fakeFetch({ '1': macheSeite(ids(3, 0), 3) }, aufrufe), 0);
    const ergebnisse = await adapter.sucheMitStatistik({ bundesland: 'kaernten', typ: 'beide' });
    expect(ergebnisse.map((e) => e.typ)).toEqual(['kauf', 'miete']);
    expect(ergebnisse[0]!.gesamtTreffer).toBe(3);
    expect(new URL(aufrufe[0]!).pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten');
    expect(new URL(aufrufe[1]!).pathname).toBe('/iad/immobilien/mietwohnungen/kaernten');
    expect(ergebnisse[1]!.inserate.every((i) => i.typ === 'miete')).toBe(true);
  });

  it('respektiert einen erhöhten maxSeiten-Deckel (Sweep-Modus)', async () => {
    // 8 volle Seiten à 30 — der Default (5 Seiten) würde bei 150 abbrechen.
    const seiten = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [String(i + 1), macheSeite(ids(30, i * 30), 240)]),
    );
    const aufrufe: string[] = [];
    const adapter = new WillhabenAdapter(fakeFetch(seiten, aufrufe), 0);

    const standard = await adapter.sucheMitStatistik({ bundesland: 'kaernten', typ: 'kauf' });
    expect(standard[0]!.inserate).toHaveLength(150);

    aufrufe.length = 0;
    const sweep = await adapter.sucheMitStatistik(
      { bundesland: 'kaernten', typ: 'kauf' },
      { maxSeiten: 15 },
    );
    expect(sweep[0]!.inserate).toHaveLength(240);
    expect(aufrufe).toHaveLength(8);
  });

  it('wirft WillhabenFehler bei HTTP-Fehlern und Netzwerkproblemen', async () => {
    const blockiert = (async () => new Response('blocked', { status: 403 })) as typeof fetch;
    await expect(new WillhabenAdapter(blockiert, 0).fetch(KAUF_URL)).rejects.toThrow(/HTTP 403/);

    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(new WillhabenAdapter(offline, 0).fetch(KAUF_URL)).rejects.toThrow(WillhabenFehler);
  });
});
