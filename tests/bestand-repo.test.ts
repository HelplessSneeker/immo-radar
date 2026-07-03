import { describe, expect, it } from 'vitest';
import {
  bestandInseratAusZeile,
  preisPunktAusZeile,
  type BestandZeile,
} from '../src/db/bestand-repo.js';

const ZEILE: BestandZeile = {
  portal: 'willhaben.at',
  inserat_id: 'wh-123',
  typ: 'kauf',
  ort: 'Villach',
  plz: '9500',
  bezirk: 'Villach Stadt',
  preis: 200000,
  flaeche_m2: 60,
  zimmer: 3,
  baujahr: null,
  zustand: null,
  url: 'https://example.at/wh-123',
  datum_erfasst: '2026-07-01',
  zuerst_gesehen: '2026-07-01',
  zuletzt_gesehen: '2026-07-03',
};

describe('bestandInseratAusZeile', () => {
  it('mappt Spalten aufs Domänenobjekt und lässt NULL-Felder weg', () => {
    expect(bestandInseratAusZeile(ZEILE)).toEqual({
      id: 'wh-123',
      portal: 'willhaben.at',
      typ: 'kauf',
      ort: 'Villach',
      plz: '9500',
      bezirk: 'Villach Stadt',
      preis: 200000,
      flaeche_m2: 60,
      zimmer: 3,
      url: 'https://example.at/wh-123',
      datum_erfasst: '2026-07-01',
      zuerstGesehen: '2026-07-01',
      zuletztGesehen: '2026-07-03',
    });
  });

  it('übernimmt optionale Felder, wenn gesetzt', () => {
    const inserat = bestandInseratAusZeile({ ...ZEILE, baujahr: 1990, zustand: 'saniert' });
    expect(inserat.baujahr).toBe(1990);
    expect(inserat.zustand).toBe('saniert');
  });
});

describe('preisPunktAusZeile', () => {
  it('mappt die Historien-Zeile', () => {
    expect(
      preisPunktAusZeile({
        portal: 'willhaben.at',
        inserat_id: 'wh-123',
        preis: 195000,
        erfasst_am: '2026-07-03',
      }),
    ).toEqual({
      portal: 'willhaben.at',
      inseratId: 'wh-123',
      preis: 195000,
      erfasstAm: '2026-07-03',
    });
  });
});
