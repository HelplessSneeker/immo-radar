import { describe, expect, it } from 'vitest';
import { parseInserateAnfrage } from '../src/search.js';

function params(eintraege: Record<string, string>): URLSearchParams {
  return new URLSearchParams(eintraege);
}

describe('parseInserateAnfrage', () => {
  it('parst gültige Filter, Sortierung und Seite', () => {
    const anfrage = parseInserateAnfrage(
      params({
        bundesland: 'kaernten',
        typ: 'kauf',
        status: 'delistet',
        ort: 'Villach',
        sortierung: 'preis',
        seite: '3',
      }),
    );
    expect(anfrage).toEqual({
      filter: { bundesland: 'kaernten', typ: 'kauf', status: 'delistet', ort: 'Villach' },
      sortierung: 'preis',
      seite: 3,
    });
  });

  it('verwirft ungültige Werte still statt zu werfen (teilbare GET-Links)', () => {
    const anfrage = parseInserateAnfrage(
      params({
        bundesland: 'atlantis',
        typ: 'schloss',
        status: 'vielleicht',
        sortierung: 'DROP TABLE',
        seite: '-2',
      }),
    );
    expect(anfrage).toEqual({ filter: {}, sortierung: 'zuletzt_gesehen', seite: 1 });
  });

  it('liefert Defaults für leere Parameter', () => {
    expect(parseInserateAnfrage(params({}))).toEqual({
      filter: {},
      sortierung: 'zuletzt_gesehen',
      seite: 1,
    });
  });

  it('normalisiert Groß-/Kleinschreibung von Auswahlwerten, nicht aber vom Ort', () => {
    const anfrage = parseInserateAnfrage(
      params({ bundesland: 'Kaernten', typ: 'MIETE', ort: 'Villach ' }),
    );
    expect(anfrage.filter).toEqual({ bundesland: 'kaernten', typ: 'miete', ort: 'Villach' });
  });

  it('parst ?nur=ausreisser case-insensitiv; andere Werte werden still verworfen', () => {
    expect(parseInserateAnfrage(params({ nur: 'ausreisser' })).filter).toEqual({
      nurAusreisser: true,
    });
    expect(parseInserateAnfrage(params({ nur: ' Ausreisser ' })).filter).toEqual({
      nurAusreisser: true,
    });
    expect(parseInserateAnfrage(params({ nur: 'alle' })).filter).toEqual({});
    expect(parseInserateAnfrage(params({ nur: '' })).filter).toEqual({});
  });
});
