import { describe, expect, it } from 'vitest';
import { buildSearchUrls } from '../src/willhaben/url.js';
import { BUNDESLAENDER } from '../src/search.js';

describe('buildSearchUrls', () => {
  it('baut für typ=kauf eine Eigentumswohnungs-URL mit Preisfilter', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', preisMin: 100000, preisMax: 300000 });
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]!.url);
    expect(urls[0]!.typ).toBe('kauf');
    expect(u.pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten');
    expect(u.searchParams.get('PRICE_FROM')).toBe('100000');
    expect(u.searchParams.get('PRICE_TO')).toBe('300000');
  });

  it('baut für typ=miete eine Mietwohnungs-URL mit Preisfilter', () => {
    const urls = buildSearchUrls({ bundesland: 'wien', typ: 'miete', preisMax: 1200 });
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]!.url);
    expect(u.pathname).toBe('/iad/immobilien/mietwohnungen/wien');
    expect(u.searchParams.get('PRICE_TO')).toBe('1200');
  });

  it('baut für typ=beide zwei URLs, Preisfilter nur am Kauf', () => {
    const urls = buildSearchUrls({ bundesland: 'steiermark', typ: 'beide', preisMax: 250000 });
    expect(urls.map((u) => u.typ)).toEqual(['kauf', 'miete']);
    const kauf = new URL(urls[0]!.url);
    const miete = new URL(urls[1]!.url);
    expect(kauf.searchParams.get('PRICE_TO')).toBe('250000');
    expect(miete.searchParams.get('PRICE_TO')).toBeNull();
  });

  it('baut Fläche- und Zimmer-Filter in die URL', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', flaecheMin: 60, flaecheMax: 100, zimmerMin: 3 });
    const u = new URL(urls[0]!.url);
    expect(u.searchParams.get('ESTATE_SIZE/LIVING_AREA_FROM')).toBe('60');
    expect(u.searchParams.get('ESTATE_SIZE/LIVING_AREA_TO')).toBe('100');
    // Zimmer nur als Buckets; 5X5 heißt beim Portal "5+".
    expect(u.searchParams.getAll('NO_OF_ROOMS_BUCKET')).toEqual(['3X3', '4X4', '5X5']);
  });

  it('begrenzt Zimmer-Buckets auf den Bereich min-max', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', zimmerMin: 2, zimmerMax: 3 });
    const u = new URL(urls[0]!.url);
    expect(u.searchParams.getAll('NO_OF_ROOMS_BUCKET')).toEqual(['2X2', '3X3']);
  });

  it('lässt Zimmer-Buckets weg, wenn der Bereich alles abdeckt', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', zimmerMin: 1 });
    const u = new URL(urls[0]!.url);
    expect(u.searchParams.getAll('NO_OF_ROOMS_BUCKET')).toEqual([]);
  });

  it('hängt Fläche/Zimmer an beide URLs bei typ=beide, Preis weiter nur am Kauf', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'beide', preisMax: 250000, flaecheMax: 40, zimmerMax: 2 });
    const kauf = new URL(urls[0]!.url);
    const miete = new URL(urls[1]!.url);
    expect(kauf.searchParams.get('PRICE_TO')).toBe('250000');
    expect(miete.searchParams.get('PRICE_TO')).toBeNull();
    for (const u of [kauf, miete]) {
      expect(u.searchParams.get('ESTATE_SIZE/LIVING_AREA_TO')).toBe('40');
      expect(u.searchParams.getAll('NO_OF_ROOMS_BUCKET')).toEqual(['1X1', '2X2']);
    }
  });

  it('lässt Fläche/Zimmer weg, wenn nicht gesetzt', () => {
    const u = new URL(buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf' })[0]!.url);
    expect(u.searchParams.get('ESTATE_SIZE/LIVING_AREA_FROM')).toBeNull();
    expect(u.searchParams.get('ESTATE_SIZE/LIVING_AREA_TO')).toBeNull();
    expect(u.searchParams.getAll('NO_OF_ROOMS_BUCKET')).toEqual([]);
  });

  it('hängt einen bekannten Ort an den Pfad', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', ort: 'Villach' });
    expect(new URL(urls[0]!.url).pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten/villach');
  });

  it('fällt bei unbekanntem Ort auf den Bundesland-Pfad zurück', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', ort: 'Irgendwo' });
    expect(new URL(urls[0]!.url).pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten');
  });

  it('setzt den Ort bei typ=beide auf beide URLs', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'beide', ort: '9020' });
    expect(new URL(urls[0]!.url).pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten/klagenfurt');
    expect(new URL(urls[1]!.url).pathname).toBe('/iad/immobilien/mietwohnungen/kaernten/klagenfurt');
  });

  it('hängt einen bekannten Bezirk an den Pfad — auch kombiniert mit Preisband', () => {
    const urls = buildSearchUrls({
      bundesland: 'kaernten',
      typ: 'kauf',
      bezirk: 'klagenfurt-stadt',
      preisMin: 150000,
      preisMax: 250000,
    });
    const u = new URL(urls[0]!.url);
    expect(u.pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten/klagenfurt');
    expect(u.searchParams.get('PRICE_FROM')).toBe('150000');
    expect(u.searchParams.get('PRICE_TO')).toBe('250000');
  });

  it('Bezirk schlägt den Ort; unbekannter Bezirk fällt auf den Bundesland-Pfad zurück', () => {
    const mitBeidem = buildSearchUrls({
      bundesland: 'kaernten',
      typ: 'kauf',
      bezirk: 'villach-stadt',
      ort: 'Klagenfurt',
    });
    expect(new URL(mitBeidem[0]!.url).pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten/villach');

    const unbekannt = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', bezirk: 'lienz' });
    expect(new URL(unbekannt[0]!.url).pathname).toBe('/iad/immobilien/eigentumswohnung/kaernten');
  });

  it('kennt alle 9 Bundesländer und wirft bei unbekanntem Slug', () => {
    expect(Object.keys(BUNDESLAENDER)).toHaveLength(9);
    for (const slug of Object.keys(BUNDESLAENDER)) {
      expect(buildSearchUrls({ bundesland: slug, typ: 'kauf' })[0]!.url).toContain(`/${slug}`);
    }
    expect(() => buildSearchUrls({ bundesland: 'bayern', typ: 'kauf' })).toThrow(/Unbekanntes Bundesland/);
  });
});
