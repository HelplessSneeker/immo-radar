import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractNextData } from '../src/willhaben/map.js';
import { mapDetail } from '../src/willhaben/detail.js';

// Echte willhaben-Detailseite (auf den __NEXT_DATA__-Block gekürzt, JSON verbatim).
const fixtureHtml = readFileSync(new URL('./fixtures/willhaben-detail.html', import.meta.url), 'utf8');

function attributNextData(attribute: { name: string; values: string[] }[]): unknown {
  return { props: { pageProps: { advertDetails: { attributes: { attribute } } } } };
}

describe('mapDetail (willhaben)', () => {
  it('extrahiert alle Kategorie-Felder aus der echten Detailseite', () => {
    const detail = mapDetail(extractNextData(fixtureHtml));
    expect(detail.baujahr).toBe(1971);
    expect(detail.zustand).toBe('Sanierungsbedürftig');
    expect(detail.baustil).toBe('Neubau');
    expect(detail.heizung).toBe('Elektroheizung');
    expect(detail.ausstattung).toContain('Einbauküche');
    expect(detail.ausstattung).toContain('Terrasse'); // FREE_AREA/FREE_AREA_TYPE
    expect(detail.ausstattung).toContain('Laminat'); // FLOOR_SURFACE
    expect(detail.energieHwb).toBe(202);
    expect(detail.energieFgee).toBe(4.58); // "4,58" mit Dezimalkomma
    expect(detail.beschreibung).toContain('3-Zimmer-Wohnung');
  });

  it('liefert {} für JSON ohne Attributliste (kein Wurf)', () => {
    expect(mapDetail({})).toEqual({});
    expect(mapDetail({ props: { pageProps: {} } })).toEqual({});
    expect(mapDetail(null)).toEqual({});
  });

  it('findet die Attributliste per Fallback-Scanner, wenn der Umschlag sich verschiebt', () => {
    const verschoben = {
      props: {
        pageProps: {
          neuerUmschlag: {
            attribute: [
              { name: 'CONSTRUCTION_YEAR', values: ['1985'] },
              { name: 'HEATING', values: ['Gasheizung'] },
            ],
          },
        },
      },
    };
    const detail = mapDetail(verschoben);
    expect(detail.baujahr).toBe(1985);
    expect(detail.heizung).toBe('Gasheizung');
  });

  it('lässt unplausible oder unlesbare Baujahre weg', () => {
    for (const wert of ['987', '2101', 'unbekannt', '']) {
      const detail = mapDetail(attributNextData([{ name: 'CONSTRUCTION_YEAR', values: [wert] }]));
      expect(detail.baujahr).toBeUndefined();
    }
  });

  it('lässt fehlende Felder einfach weg', () => {
    const detail = mapDetail(attributNextData([{ name: 'HEATING', values: ['Fernwärme'] }]));
    expect(detail).toEqual({ heizung: 'Fernwärme' });
  });
});
