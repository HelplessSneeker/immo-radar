import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImmoScout24ParseFehler } from '../src/immoscout24/map.js';
import { extractApolloState, mapDetail } from '../src/immoscout24/detail.js';

// Echte Expose-Seite (auf __INITIAL_STATE__/__APOLLO_STATE__ gekürzt, JSON verbatim).
const fixtureHtml = readFileSync(new URL('./fixtures/immoscout24-detail.html', import.meta.url), 'utf8');

describe('extractApolloState', () => {
  it('findet den GraphQL-Cache der Expose-Seite', () => {
    const state = extractApolloState(fixtureHtml) as Record<string, unknown>;
    expect(Object.keys(state).some((k) => k.startsWith('Expose:'))).toBe(true);
  });

  it('wirft bei Seiten ohne __APOLLO_STATE__ (Bot-Block/Layout-Änderung)', () => {
    expect(() => extractApolloState('<html><body>Zugriff verweigert</body></html>')).toThrow(
      ImmoScout24ParseFehler,
    );
  });
});

describe('mapDetail (immoscout24)', () => {
  it('extrahiert die Kategorie-Felder aus der echten Expose-Seite', () => {
    const detail = mapDetail(extractApolloState(fixtureHtml));
    expect(detail.baujahr).toBe(2025); // condition.yearOfConstruction "2025"
    expect(detail.zustand).toBe('Erstbezug');
    expect(detail.baustil).toBe('Neubau');
    expect(detail.ausstattung).toContain('Garten');
    expect(detail.ausstattung).toContain('Terrasse');
    expect(detail.ausstattung).toContain('Parkett');
    expect(detail.ausstattung).not.toContain('Erstbezug'); // Zustand ist keine Ausstattung
    expect(detail.beschreibung).toContain('Wörthersee');
    // Neubau-Expose ohne Energieausweis-Werte:
    expect(detail.energieHwb).toBeUndefined();
    expect(detail.energieFgee).toBeUndefined();
  });

  it('liest Heizung und Energiewerte aus condition/energyCertification', () => {
    const detail = mapDetail({
      'Expose:abc': {
        condition: {
          yearOfConstruction: '1990',
          heatingTypes: ['Fernwärme'],
          energyCertification: { heatingDemand: '48,3', totalEnergyEfficiencyFactor: 0.8 },
        },
      },
    });
    expect(detail.baujahr).toBe(1990);
    expect(detail.heizung).toBe('Fernwärme');
    expect(detail.energieHwb).toBe(48.3); // Dezimalkomma normalisiert
    expect(detail.energieFgee).toBe(0.8);
  });

  it('fällt für das Baujahr auf den Anzeige-Text "Baujahr NNNN" zurück', () => {
    const detail = mapDetail({
      'Expose:abc': {
        characteristics: [
          { key: 'condition', items: [{ key: 'year_of_construction', text: 'Baujahr 2003' }] },
        ],
      },
    });
    expect(detail.baujahr).toBe(2003);
  });

  it('nimmt die Heizung notfalls aus den characteristics-Texten', () => {
    const detail = mapDetail({
      'Expose:abc': {
        characteristics: [{ key: 'features', items: [{ key: 'heating_type', text: 'Etagenheizung' }] }],
      },
    });
    expect(detail.heizung).toBe('Etagenheizung');
    expect(detail.ausstattung).toBeUndefined(); // Heizung zählt nicht als Ausstattung
  });

  it('liefert {} für fremdes JSON ohne Expose-Eintrag (kein Wurf)', () => {
    expect(mapDetail({})).toEqual({});
    expect(mapDetail({ config: { environment: 'pro' } })).toEqual({});
    expect(mapDetail(null)).toEqual({});
  });
});
