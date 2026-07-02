import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractInitialState,
  extractPageData,
  ImmoScout24ParseFehler,
  mapPage,
  type ImmoScout24PageData,
} from '../src/immoscout24/map.js';

const fixtureHtml = readFileSync(new URL('./fixtures/immoscout24-initial-state.html', import.meta.url), 'utf8');

function fixturePageData(): ImmoScout24PageData {
  return extractPageData(extractInitialState(fixtureHtml));
}

describe('extractInitialState', () => {
  it('findet das Objekt und ignoriert die Script-Statements dahinter', () => {
    expect(fixturePageData().totalHits).toBe(5);
  });

  it('ersetzt bare undefined-Werte durch null, lässt "undefined" in Strings stehen', () => {
    const state = extractInitialState(fixtureHtml) as {
      searchUI: { aggregations: unknown };
      shortlist: { error: unknown };
    };
    expect(state.searchUI.aggregations).toBeNull();
    expect(state.shortlist.error).toBeNull();
    const headlines = fixturePageData().hits!.map((h) => (h as { headline?: string }).headline);
    expect(headlines).toContain('Zustand laut Gutachten: undefined');
    expect(headlines).toContain('Top {2-Zimmer} Wohnung am See'); // Klammern in Strings zählen nicht
  });

  it('wirft bei Seiten ohne __INITIAL_STATE__ (Bot-Block/Layout-Änderung)', () => {
    expect(() => extractInitialState('<html><body>Zugriff verweigert</body></html>')).toThrow(
      ImmoScout24ParseFehler,
    );
  });

  it('wirft, wenn das Objekt nicht endet', () => {
    expect(() => extractInitialState('window.__INITIAL_STATE__ = {"a":{"b":1}')).toThrow(ImmoScout24ParseFehler);
  });

  it('wirft bei Nicht-JSON-Konstrukten', () => {
    expect(() => extractInitialState('window.__INITIAL_STATE__ = {a:1};')).toThrow(ImmoScout24ParseFehler);
  });
});

describe('extractPageData', () => {
  it('wirft, wenn keine results vorhanden sind', () => {
    expect(() => extractPageData({ reduxAsyncConnect: { pageData: {} } })).toThrow(ImmoScout24ParseFehler);
    expect(() => extractPageData(null)).toThrow(ImmoScout24ParseFehler);
  });
});

describe('mapPage', () => {
  it('mappt valide Treffer und überspringt unbrauchbare', () => {
    const { inserate, uebersprungen } = mapPage(fixturePageData(), 'kauf', 'Kärnten', '2026-07-02');
    // Fixture: 2 valide + Neubauprojekt (Preis 0), kaputte Adresse, ohne exposeId
    expect(inserate).toHaveLength(2);
    expect(uebersprungen).toBe(3);
  });

  it('übernimmt alle Felder inklusive is24-Präfix, URL und Datum', () => {
    const { inserate } = mapPage(fixturePageData(), 'kauf', 'Kärnten', '2026-01-01');
    const erstes = inserate[0]!;
    expect(erstes.id).toBe('is24-69e22f3e18d1ee437efdea4d');
    expect(erstes.typ).toBe('kauf');
    expect(erstes.ort).toBe('Krumpendorf am Wörthersee');
    expect(erstes.plz).toBe('9201');
    expect(erstes.bezirk).toBe('Kärnten');
    expect(erstes.preis).toBe(405530);
    expect(erstes.flaeche_m2).toBe(50.33);
    expect(erstes.zimmer).toBe(2);
    expect(erstes.url).toBe('https://www.immobilienscout24.at/expose/69e22f3e18d1ee437efdea4d');
    expect(erstes.datum_erfasst).toBe('2026-06-16'); // aus dateCreated, nicht "heute"
  });

  it('splittet auch Adressen mit Straßenteil in PLZ und Ort', () => {
    const { inserate } = mapPage(fixturePageData(), 'kauf', 'Kärnten', '2026-07-02');
    const zweites = inserate[1]!;
    expect(zweites.plz).toBe('9210');
    expect(zweites.ort).toBe('Pörtschach am Wörther See');
  });

  it('fällt ohne Bundesland-Bezirk auf den Ort zurück', () => {
    const { inserate } = mapPage(fixturePageData(), 'kauf', '', '2026-07-02');
    expect(inserate[0]!.bezirk).toBe('Krumpendorf am Wörthersee');
  });

  it('setzt den übergebenen Inserat-Typ (miete)', () => {
    const { inserate } = mapPage(fixturePageData(), 'miete', 'Kärnten', '2026-07-02');
    expect(inserate.every((i) => i.typ === 'miete')).toBe(true);
  });

  it('liefert eine leere Liste für Seiten ohne Treffer', () => {
    expect(mapPage({ totalHits: 0 }, 'kauf', 'Kärnten', '2026-07-02')).toEqual({
      inserate: [],
      uebersprungen: 0,
    });
  });
});
