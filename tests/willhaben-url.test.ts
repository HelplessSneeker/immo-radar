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

  it('kennt alle 9 Bundesländer und wirft bei unbekanntem Slug', () => {
    expect(Object.keys(BUNDESLAENDER)).toHaveLength(9);
    for (const slug of Object.keys(BUNDESLAENDER)) {
      expect(buildSearchUrls({ bundesland: slug, typ: 'kauf' })[0]!.url).toContain(`/${slug}`);
    }
    expect(() => buildSearchUrls({ bundesland: 'bayern', typ: 'kauf' })).toThrow(/Unbekanntes Bundesland/);
  });
});
