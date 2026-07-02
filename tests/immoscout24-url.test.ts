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

  it('kennt alle 9 Bundesländer und wirft bei unbekanntem Slug', () => {
    for (const slug of Object.keys(BUNDESLAENDER)) {
      expect(buildSearchUrls({ bundesland: slug, typ: 'kauf' })[0]!.url).toContain(`/${slug}/`);
    }
    expect(() => buildSearchUrls({ bundesland: 'bayern', typ: 'kauf' })).toThrow(/Unbekanntes Bundesland/);
  });
});
