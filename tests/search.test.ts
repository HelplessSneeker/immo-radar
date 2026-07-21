import { describe, expect, it } from 'vitest';
import { parseInserateAnfrage } from '../src/search.js';

function params(eintraege: Record<string, string | string[]>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [name, wert] of Object.entries(eintraege)) {
    for (const einzeln of Array.isArray(wert) ? wert : [wert]) p.append(name, einzeln);
  }
  return p;
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

  it('parst den Baujahr-Bereich als Integer, auch einseitig', () => {
    expect(
      parseInserateAnfrage(params({ baujahr_min: '1980', baujahr_max: '1995' })).filter,
    ).toEqual({ baujahrMin: 1980, baujahrMax: 1995 });
    expect(parseInserateAnfrage(params({ baujahr_min: '2000' })).filter).toEqual({
      baujahrMin: 2000,
    });
    expect(parseInserateAnfrage(params({ baujahr_max: '2000' })).filter).toEqual({
      baujahrMax: 2000,
    });
  });

  it('dreht verdrehte Baujahr-Grenzen um statt sie zu verwerfen', () => {
    expect(
      parseInserateAnfrage(params({ baujahr_min: '2000', baujahr_max: '1980' })).filter,
    ).toEqual({ baujahrMin: 1980, baujahrMax: 2000 });
  });

  it('verwirft unplausible Baujahre still (kein Integer oder außerhalb 1800–2100)', () => {
    expect(parseInserateAnfrage(params({ baujahr_min: 'abc' })).filter).toEqual({});
    expect(parseInserateAnfrage(params({ baujahr_min: '1799' })).filter).toEqual({});
    expect(parseInserateAnfrage(params({ baujahr_max: '2101' })).filter).toEqual({});
    expect(parseInserateAnfrage(params({ baujahr_min: '1990.5' })).filter).toEqual({});
    expect(parseInserateAnfrage(params({ baujahr_min: '' })).filter).toEqual({});
    // Die verworfene Grenze reißt die gültige nicht mit.
    expect(
      parseInserateAnfrage(params({ baujahr_min: 'abc', baujahr_max: '1990' })).filter,
    ).toEqual({ baujahrMax: 1990 });
  });

  it('übernimmt Heizung/Zustand/Baustil getrimmt und case-erhaltend (rohe Portal-Strings)', () => {
    expect(
      parseInserateAnfrage(
        params({ heizung: ' Fernwärme ', zustand: 'Erstbezug', baustil: 'Altbau' }),
      ).filter,
    ).toEqual({ heizung: 'Fernwärme', zustand: 'Erstbezug', baustil: 'Altbau' });
    expect(parseInserateAnfrage(params({ heizung: '  ' })).filter).toEqual({});
  });

  it('sammelt Ausstattung aus wiederholten Params: getrimmt, dedupet, Leere raus', () => {
    expect(
      parseInserateAnfrage(
        params({ ausstattung: ['Balkon', ' Lift ', 'Balkon', '  '] }),
      ).filter,
    ).toEqual({ ausstattung: ['Balkon', 'Lift'] });
    expect(parseInserateAnfrage(params({ ausstattung: ['', ' '] })).filter).toEqual({});
  });

  it('kombiniert Facetten mit den bestehenden Filtern in einer Anfrage', () => {
    const anfrage = parseInserateAnfrage(
      params({
        bundesland: 'kaernten',
        typ: 'kauf',
        baujahr_min: '1980',
        heizung: 'Fernwärme',
        ausstattung: ['Balkon', 'Garten'],
      }),
    );
    expect(anfrage.filter).toEqual({
      bundesland: 'kaernten',
      typ: 'kauf',
      baujahrMin: 1980,
      heizung: 'Fernwärme',
      ausstattung: ['Balkon', 'Garten'],
    });
  });
});
