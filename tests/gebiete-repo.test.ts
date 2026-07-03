import { describe, expect, it } from 'vitest';
import {
  crawlLaufAusZeile,
  gebietAusZeile,
  type CrawlLaufZeile,
  type GebietZeile,
} from '../src/db/gebiete-repo.js';

const GEBIET_ZEILE: GebietZeile = {
  id: 3,
  name: 'Villach Zentrum',
  bundesland: 'kaernten',
  typ: 'beide',
  preis_min: null,
  preis_max: 300000,
  flaeche_min: 50,
  flaeche_max: null,
  zimmer_min: null,
  zimmer_max: null,
  ort: 'Villach',
  aktiv: true,
  erstellt_am: new Date('2026-07-01T08:00:00Z'),
};

describe('gebietAusZeile', () => {
  it('mappt Spalten auf SuchKriterien und lässt NULL-Felder weg', () => {
    expect(gebietAusZeile(GEBIET_ZEILE)).toEqual({
      id: 3,
      name: 'Villach Zentrum',
      kriterien: {
        bundesland: 'kaernten',
        typ: 'beide',
        preisMax: 300000,
        flaecheMin: 50,
        ort: 'Villach',
      },
      aktiv: true,
      erstelltAm: new Date('2026-07-01T08:00:00Z'),
    });
  });
});

describe('crawlLaufAusZeile', () => {
  const ZEILE: CrawlLaufZeile = {
    id: 12,
    gebiet_id: 3,
    lauf_datum: '2026-07-03',
    status: 'fertig',
    quellen: ['willhaben.at Kärnten (Kauf: 10 von 12 Inseraten geladen)'],
    fehler: null,
    inserate_gesehen: 10,
    gestartet_am: new Date('2026-07-03T04:00:00Z'),
    beendet_am: new Date('2026-07-03T04:01:30Z'),
  };

  it('mappt einen fertigen Lauf', () => {
    expect(crawlLaufAusZeile(ZEILE)).toEqual({
      id: 12,
      gebietId: 3,
      laufDatum: '2026-07-03',
      status: 'fertig',
      quellen: ['willhaben.at Kärnten (Kauf: 10 von 12 Inseraten geladen)'],
      inserateGesehen: 10,
      gestartetAm: new Date('2026-07-03T04:00:00Z'),
      beendetAm: new Date('2026-07-03T04:01:30Z'),
    });
  });

  it('mappt einen laufenden Lauf ohne optionale Felder', () => {
    const lauf = crawlLaufAusZeile({
      ...ZEILE,
      status: 'laufend',
      quellen: null,
      inserate_gesehen: null,
      beendet_am: null,
    });
    expect(lauf.quellen).toEqual([]);
    expect(lauf.fehler).toBeUndefined();
    expect(lauf.inserateGesehen).toBeUndefined();
    expect(lauf.beendetAm).toBeUndefined();
  });
});
