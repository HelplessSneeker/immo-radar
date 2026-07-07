import { describe, expect, it } from 'vitest';
import { BEZIRKE_KAERNTEN, BEZIRK_GESAMT, bezirkName, bezirkSlug } from '../src/bezirke.js';
import { normalisiereOrt } from '../src/ort-slugs.js';

describe('BEZIRKE_KAERNTEN', () => {
  it('enthält alle 10 politischen Bezirke Kärntens mit eindeutigen Schlüsseln', () => {
    expect(BEZIRKE_KAERNTEN).toHaveLength(10);
    const schluessel = BEZIRKE_KAERNTEN.map((b) => b.schluessel);
    expect(new Set(schluessel).size).toBe(10);
    // Das Rest-Segment ist kein Bezirk und darf nie mit einem kollidieren.
    expect(schluessel).not.toContain(BEZIRK_GESAMT);
  });

  it('Schlüssel folgen der Slug-Konvention (normalisierter Name oder Stadt-Suffix)', () => {
    for (const bezirk of BEZIRKE_KAERNTEN) {
      // 'Klagenfurt Stadt' → 'klagenfurt-stadt' usw. — Schlüssel sind der
      // normalisierte Anzeigename, damit sie sich stabil ableiten lassen.
      expect(bezirk.schluessel).toBe(normalisiereOrt(bezirk.name));
    }
  });

  it('gesetzte Portal-Slugs sind kleingeschrieben und URL-tauglich', () => {
    for (const bezirk of BEZIRKE_KAERNTEN) {
      for (const slug of [bezirk.willhaben, bezirk.immoscout24]) {
        if (slug !== undefined) expect(slug).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });
});

describe('bezirkName', () => {
  it('liefert Anzeigenamen für Bezirke und das Rest-Segment', () => {
    expect(bezirkName('klagenfurt-stadt')).toBe('Klagenfurt Stadt');
    expect(bezirkName(BEZIRK_GESAMT)).toBe('Kärnten gesamt');
    expect(bezirkName('unbekannt')).toBe('unbekannt');
  });
});

describe('bezirkSlug', () => {
  it('liefert den Portal-Slug eines bekannten Bezirks', () => {
    expect(
      bezirkSlug({ bundesland: 'kaernten', typ: 'kauf', bezirk: 'klagenfurt-stadt' }, 'willhaben'),
    ).toBe('klagenfurt');
    expect(
      bezirkSlug({ bundesland: 'kaernten', typ: 'kauf', bezirk: 'klagenfurt-stadt' }, 'immoscout24'),
    ).toBe('klagenfurt-am-woerthersee');
  });

  it('unterscheidet Stadt- und Land-Bezirke (Klagenfurt)', () => {
    expect(
      bezirkSlug({ bundesland: 'kaernten', typ: 'kauf', bezirk: 'klagenfurt-land' }, 'willhaben'),
    ).toBe('klagenfurt-land');
  });

  it('liefert undefined ohne Bezirk, außerhalb Kärntens oder bei unbekanntem Schlüssel', () => {
    expect(bezirkSlug({ bundesland: 'kaernten', typ: 'kauf' }, 'willhaben')).toBeUndefined();
    expect(
      bezirkSlug({ bundesland: 'wien', typ: 'kauf', bezirk: 'klagenfurt-stadt' }, 'willhaben'),
    ).toBeUndefined();
    expect(
      bezirkSlug({ bundesland: 'kaernten', typ: 'kauf', bezirk: 'lienz' }, 'willhaben'),
    ).toBeUndefined();
  });
});
