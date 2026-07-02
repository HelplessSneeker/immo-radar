import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractNextData,
  extractSearchResult,
  mapPage,
  WillhabenParseFehler,
  type WillhabenSearchResult,
} from '../src/willhaben/map.js';

const fixtureJson = readFileSync(new URL('./fixtures/willhaben-next-data.json', import.meta.url), 'utf8');

function fixtureSearchResult(): WillhabenSearchResult {
  return extractSearchResult(JSON.parse(fixtureJson));
}

function alsHtml(nextDataJson: string): string {
  return `<!DOCTYPE html><html><body>
    <script id="__NEXT_DATA__" type="application/json">${nextDataJson}</script>
  </body></html>`;
}

describe('extractNextData', () => {
  it('findet und parst das __NEXT_DATA__-JSON', () => {
    const nextData = extractNextData(alsHtml(fixtureJson));
    expect(extractSearchResult(nextData).rowsFound).toBe(5);
  });

  it('wirft bei Seiten ohne __NEXT_DATA__ (Bot-Block/Layout-Änderung)', () => {
    expect(() => extractNextData('<html><body>Zugriff verweigert</body></html>')).toThrow(WillhabenParseFehler);
  });

  it('wirft bei kaputtem JSON', () => {
    expect(() => extractNextData(alsHtml('{nicht json'))).toThrow(WillhabenParseFehler);
  });
});

describe('extractSearchResult', () => {
  it('wirft, wenn kein searchResult vorhanden ist', () => {
    expect(() => extractSearchResult({ props: { pageProps: {} } })).toThrow(WillhabenParseFehler);
  });
});

describe('mapPage', () => {
  it('mappt valide Inserate und überspringt unbrauchbare', () => {
    const { inserate, uebersprungen } = mapPage(fixtureSearchResult(), 'kauf', '2026-07-02');
    // Fixture: 2 valide + je eines mit 0 Zimmern, ohne Fläche, ohne Preis
    expect(inserate).toHaveLength(2);
    expect(uebersprungen).toBe(3);
  });

  it('übernimmt alle Felder inklusive wh-Präfix, URL und Datum', () => {
    const { inserate } = mapPage(fixtureSearchResult(), 'kauf', '2026-01-01');
    const erstes = inserate[0]!;
    expect(erstes.id).toBe('wh-2119553802');
    expect(erstes.typ).toBe('kauf');
    expect(erstes.ort).toBe('Seeboden');
    expect(erstes.plz).toMatch(/^\d{4}$/);
    expect(erstes.bezirk.length).toBeGreaterThan(0);
    expect(erstes.preis).toBe(348000);
    expect(erstes.flaeche_m2).toBe(68);
    expect(erstes.zimmer).toBe(3);
    expect(erstes.url).toMatch(/^https:\/\/www\.willhaben\.at\/iad\/immobilien/);
    expect(erstes.datum_erfasst).toBe('2026-07-02'); // aus PUBLISHED_String, nicht "heute"
  });

  it('setzt den übergebenen Inserat-Typ (miete)', () => {
    const { inserate } = mapPage(fixtureSearchResult(), 'miete', '2026-07-02');
    expect(inserate.every((i) => i.typ === 'miete')).toBe(true);
  });

  it('liefert eine leere Liste für Seiten ohne Inserate', () => {
    const leer: WillhabenSearchResult = { rowsFound: 0, rowsReturned: 0 };
    expect(mapPage(leer, 'kauf', '2026-07-02')).toEqual({ inserate: [], uebersprungen: 0 });
  });
});
