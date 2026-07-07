import { describe, expect, it } from 'vitest';
import { buildSearchUrls } from '../src/immoscout24/url.js';
import { BUNDESLAENDER } from '../src/search.js';

describe('buildSearchUrls (immoscout24)', () => {
  it('baut für typ=kauf eine Wohnung-kaufen-URL mit Preisfilter', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', preisMin: 100000, preisMax: 300000 });
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]!.url);
    expect(urls[0]!.typ).toBe('kauf');
    expect(u.pathname).toBe('/regional/kaernten/wohnung-kaufen');
    expect(u.searchParams.get('primaryPriceFrom')).toBe('100000');
    expect(u.searchParams.get('primaryPriceTo')).toBe('300000');
  });

  it('baut für typ=miete eine Wohnung-mieten-URL mit Preisfilter', () => {
    const urls = buildSearchUrls({ bundesland: 'wien', typ: 'miete', preisMax: 1200 });
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]!.url);
    expect(u.pathname).toBe('/regional/wien/wohnung-mieten');
    expect(u.searchParams.get('primaryPriceTo')).toBe('1200');
  });

  it('baut für typ=beide zwei URLs, Preisfilter nur am Kauf', () => {
    const urls = buildSearchUrls({ bundesland: 'steiermark', typ: 'beide', preisMax: 250000 });
    expect(urls.map((u) => u.typ)).toEqual(['kauf', 'miete']);
    const kauf = new URL(urls[0]!.url);
    const miete = new URL(urls[1]!.url);
    expect(kauf.searchParams.get('primaryPriceTo')).toBe('250000');
    expect(miete.searchParams.get('primaryPriceTo')).toBeNull();
  });

  it('baut Fläche- und Zimmer-Filter in die URL', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', flaecheMin: 60, flaecheMax: 100, zimmerMin: 3 });
    const u = new URL(urls[0]!.url);
    expect(u.searchParams.get('primaryAreaFrom')).toBe('60');
    expect(u.searchParams.get('primaryAreaTo')).toBe('100');
    expect(u.searchParams.get('numberOfRoomsFrom')).toBe('3');
    expect(u.searchParams.get('numberOfRoomsTo')).toBeNull();
  });

  it('hängt Fläche/Zimmer an beide URLs bei typ=beide, Preis weiter nur am Kauf', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'beide', preisMax: 250000, flaecheMax: 40, zimmerMax: 2 });
    const kauf = new URL(urls[0]!.url);
    const miete = new URL(urls[1]!.url);
    expect(kauf.searchParams.get('primaryPriceTo')).toBe('250000');
    expect(miete.searchParams.get('primaryPriceTo')).toBeNull();
    for (const u of [kauf, miete]) {
      expect(u.searchParams.get('primaryAreaTo')).toBe('40');
      expect(u.searchParams.get('numberOfRoomsTo')).toBe('2');
    }
  });

  it('lässt Fläche/Zimmer weg, wenn nicht gesetzt', () => {
    const u = new URL(buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf' })[0]!.url);
    expect(u.searchParams.get('primaryAreaFrom')).toBeNull();
    expect(u.searchParams.get('primaryAreaTo')).toBeNull();
    expect(u.searchParams.get('numberOfRoomsFrom')).toBeNull();
    expect(u.searchParams.get('numberOfRoomsTo')).toBeNull();
  });

  it('hängt einen bekannten Ort zwischen Bundesland und Kategorie', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', ort: '9020' });
    expect(new URL(urls[0]!.url).pathname).toBe('/regional/kaernten/klagenfurt-am-woerthersee/wohnung-kaufen');
  });

  it('fällt bei unbekanntem Ort auf den Bundesland-Pfad zurück', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', ort: 'Irgendwo' });
    expect(new URL(urls[0]!.url).pathname).toBe('/regional/kaernten/wohnung-kaufen');
  });

  it('setzt den Ort bei typ=beide auf beide URLs', () => {
    const urls = buildSearchUrls({ bundesland: 'kaernten', typ: 'beide', ort: 'Villach' });
    expect(new URL(urls[0]!.url).pathname).toBe('/regional/kaernten/villach/wohnung-kaufen');
    expect(new URL(urls[1]!.url).pathname).toBe('/regional/kaernten/villach/wohnung-mieten');
  });

  it('hängt einen bekannten Bezirk in den Pfad — auch kombiniert mit Preisband', () => {
    const urls = buildSearchUrls({
      bundesland: 'kaernten',
      typ: 'miete',
      bezirk: 'klagenfurt-stadt',
      preisMin: 700,
      preisMax: 1000,
    });
    const u = new URL(urls[0]!.url);
    expect(u.pathname).toBe('/regional/kaernten/klagenfurt-am-woerthersee/wohnung-mieten');
    expect(u.searchParams.get('primaryPriceFrom')).toBe('700');
    expect(u.searchParams.get('primaryPriceTo')).toBe('1000');
  });

  it('Bezirk schlägt den Ort; unbekannter Bezirk fällt auf den Bundesland-Pfad zurück', () => {
    const mitBeidem = buildSearchUrls({
      bundesland: 'kaernten',
      typ: 'kauf',
      bezirk: 'villach-stadt',
      ort: 'Klagenfurt',
    });
    expect(new URL(mitBeidem[0]!.url).pathname).toBe('/regional/kaernten/villach/wohnung-kaufen');

    const unbekannt = buildSearchUrls({ bundesland: 'kaernten', typ: 'kauf', bezirk: 'lienz' });
    expect(new URL(unbekannt[0]!.url).pathname).toBe('/regional/kaernten/wohnung-kaufen');
  });

  it('kennt alle 9 Bundesländer und wirft bei unbekanntem Slug', () => {
    for (const slug of Object.keys(BUNDESLAENDER)) {
      expect(buildSearchUrls({ bundesland: slug, typ: 'kauf' })[0]!.url).toContain(`/${slug}/`);
    }
    expect(() => buildSearchUrls({ bundesland: 'bayern', typ: 'kauf' })).toThrow(/Unbekanntes Bundesland/);
  });
});
