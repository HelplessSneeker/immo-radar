import { describe, expect, it } from 'vitest';
import { filterInserate, parseGebietForm, parseSuchKriterien, SuchKriterienFehler } from '../src/search.js';
import type { Inserat } from '../src/types.js';

function params(eintraege: Record<string, string>): URLSearchParams {
  return new URLSearchParams(eintraege);
}

describe('parseSuchKriterien', () => {
  it('parst alle Felder und normalisiert Zahlen mit Komma', () => {
    const k = parseSuchKriterien(
      params({
        bundesland: 'kaernten',
        typ: 'kauf',
        preis_min: '100000',
        preis_max: '300000',
        flaeche_min: '50,5',
        zimmer_max: '4',
        ort: ' Villach ',
      }),
    );
    expect(k).toEqual({
      bundesland: 'kaernten',
      typ: 'kauf',
      preisMin: 100000,
      preisMax: 300000,
      flaecheMin: 50.5,
      flaecheMax: undefined,
      zimmerMin: undefined,
      zimmerMax: 4,
      ort: 'Villach',
    });
  });

  it('setzt typ=beide als Default und lässt leere Felder weg', () => {
    const k = parseSuchKriterien(params({ bundesland: 'Wien', typ: '', preis_min: '', ort: '  ' }));
    expect(k.bundesland).toBe('wien');
    expect(k.typ).toBe('beide');
    expect(k.preisMin).toBeUndefined();
    expect(k.ort).toBeUndefined();
  });

  it('wirft bei unbekanntem Bundesland', () => {
    expect(() => parseSuchKriterien(params({ bundesland: 'bayern' }))).toThrow(SuchKriterienFehler);
    expect(() => parseSuchKriterien(new URLSearchParams())).toThrow(SuchKriterienFehler);
  });

  it('wirft bei ungültigem typ, negativen Zahlen und min > max', () => {
    expect(() => parseSuchKriterien(params({ bundesland: 'wien', typ: 'pacht' }))).toThrow(SuchKriterienFehler);
    expect(() => parseSuchKriterien(params({ bundesland: 'wien', preis_min: '-5' }))).toThrow(SuchKriterienFehler);
    expect(() => parseSuchKriterien(params({ bundesland: 'wien', zimmer_min: 'abc' }))).toThrow(SuchKriterienFehler);
    expect(() =>
      parseSuchKriterien(params({ bundesland: 'wien', flaeche_min: '80', flaeche_max: '50' })),
    ).toThrow(SuchKriterienFehler);
  });
});

describe('parseGebietForm', () => {
  it('liefert Name und Kriterien', () => {
    const { name, kriterien } = parseGebietForm(
      params({ name: ' Villach Zentrum ', bundesland: 'kaernten', ort: 'Villach' }),
    );
    expect(name).toBe('Villach Zentrum');
    expect(kriterien.bundesland).toBe('kaernten');
    expect(kriterien.ort).toBe('Villach');
  });

  it('wirft ohne Namen und bei ungültigen Kriterien', () => {
    expect(() => parseGebietForm(params({ bundesland: 'kaernten' }))).toThrow('Namen');
    expect(() => parseGebietForm(params({ name: 'X', bundesland: 'bayern' }))).toThrow(
      SuchKriterienFehler,
    );
  });
});

function inserat(teil: Partial<Inserat>): Inserat {
  return {
    id: 'x',
    typ: 'kauf',
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis: 200000,
    flaeche_m2: 70,
    zimmer: 3,
    datum_erfasst: '2026-07-02',
    ...teil,
  };
}

describe('filterInserate', () => {
  const kriterienBasis = { bundesland: 'kaernten', typ: 'beide' as const };

  it('filtert Fläche und Zimmer als Bereiche', () => {
    const liste = [
      inserat({ id: 'a', flaeche_m2: 40 }),
      inserat({ id: 'b', flaeche_m2: 70, zimmer: 2 }),
      inserat({ id: 'c', flaeche_m2: 90, zimmer: 4 }),
    ];
    const treffer = filterInserate(liste, { ...kriterienBasis, flaecheMin: 60, zimmerMin: 3 });
    expect(treffer.map((i) => i.id)).toEqual(['c']);
  });

  it('wendet den Preis bei typ=beide nur auf Kauf-Inserate an', () => {
    const liste = [
      inserat({ id: 'kauf-teuer', typ: 'kauf', preis: 500000 }),
      inserat({ id: 'kauf-ok', typ: 'kauf', preis: 250000 }),
      inserat({ id: 'miete', typ: 'miete', preis: 900 }),
    ];
    const treffer = filterInserate(liste, { ...kriterienBasis, preisMax: 300000 });
    expect(treffer.map((i) => i.id)).toEqual(['kauf-ok', 'miete']);
  });

  it('wendet den Preis bei typ=miete auf die Miete an', () => {
    const liste = [
      inserat({ id: 'billig', typ: 'miete', preis: 600 }),
      inserat({ id: 'teuer', typ: 'miete', preis: 1400 }),
    ];
    const treffer = filterInserate(liste, { bundesland: 'kaernten', typ: 'miete', preisMax: 1000 });
    expect(treffer.map((i) => i.id)).toEqual(['billig']);
  });

  it('matcht ort case-insensitiv gegen Ort, PLZ und Bezirk', () => {
    const liste = [
      inserat({ id: 'ort', ort: 'Villach' }),
      inserat({ id: 'plz', ort: 'Seeboden', plz: '9871', bezirk: 'Spittal' }),
      inserat({ id: 'bezirk', ort: 'Ferlach', plz: '9170', bezirk: 'Klagenfurt Land' }),
    ];
    expect(filterInserate(liste, { ...kriterienBasis, ort: 'villach' }).map((i) => i.id)).toEqual(['ort']);
    expect(filterInserate(liste, { ...kriterienBasis, ort: '9871' }).map((i) => i.id)).toEqual(['plz']);
    expect(filterInserate(liste, { ...kriterienBasis, ort: 'klagenfurt' }).map((i) => i.id)).toEqual(['bezirk']);
  });

  it('lässt ohne Kriterien alles durch', () => {
    const liste = [inserat({ id: 'a' }), inserat({ id: 'b', typ: 'miete', preis: 800 })];
    expect(filterInserate(liste, kriterienBasis)).toHaveLength(2);
  });
});
