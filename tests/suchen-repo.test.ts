import { describe, expect, it } from 'vitest';
import {
  inseratAusZeile,
  sucheAusZeile,
  type InseratZeile,
  type SucheZeile,
} from '../src/db/suchen-repo.js';
import { migrationsVersion } from '../src/db/migrieren.js';
import { kriterienZusammenfassung } from '../src/pages/suchen-pages.js';

const SUCHE_ZEILE: SucheZeile = {
  id: 7,
  status: 'fertig',
  bundesland: 'kaernten',
  typ: 'kauf',
  preis_min: 100000,
  preis_max: 300000,
  flaeche_min: 50,
  flaeche_max: null,
  zimmer_min: null,
  zimmer_max: null,
  ort: 'Villach',
  quellen: ['willhaben.at Kärnten (Kauf: 10 von 12 Inseraten geladen)'],
  fehler: null,
  erstellt_am: new Date('2026-07-02T10:00:00Z'),
  beendet_am: new Date('2026-07-02T10:00:09Z'),
  treffer: 10,
};

describe('sucheAusZeile', () => {
  it('mappt Spalten auf SuchKriterien und lässt NULL-Felder weg', () => {
    const suche = sucheAusZeile(SUCHE_ZEILE);
    expect(suche.kriterien).toEqual({
      bundesland: 'kaernten',
      typ: 'kauf',
      preisMin: 100000,
      preisMax: 300000,
      flaecheMin: 50,
      ort: 'Villach',
    });
    expect(suche.status).toBe('fertig');
    expect(suche.treffer).toBe(10);
    expect(suche.fehler).toBeUndefined();
    expect(suche.beendetAm).toEqual(new Date('2026-07-02T10:00:09Z'));
  });

  it('übernimmt Fehler und leere Quellen bei fehlgeschlagenen Suchen', () => {
    const suche = sucheAusZeile({
      ...SUCHE_ZEILE,
      status: 'fehlgeschlagen',
      quellen: null,
      fehler: 'Kein Portal ist gerade abfragbar: Timeout',
    });
    expect(suche.quellen).toEqual([]);
    expect(suche.fehler).toContain('Timeout');
  });
});

describe('inseratAusZeile', () => {
  it('mappt inserat_id auf id und erhält das ISO-Datum als String', () => {
    const zeile: InseratZeile = {
      inserat_id: 'WH-123',
      typ: 'miete',
      ort: 'Klagenfurt',
      plz: '9020',
      bezirk: 'Klagenfurt Stadt',
      preis: 650,
      flaeche_m2: 55.5,
      zimmer: 2,
      baujahr: null,
      zustand: null,
      url: 'https://example.at/wh-123',
      datum_erfasst: '2026-07-02',
    };
    expect(inseratAusZeile(zeile)).toEqual({
      id: 'WH-123',
      typ: 'miete',
      ort: 'Klagenfurt',
      plz: '9020',
      bezirk: 'Klagenfurt Stadt',
      preis: 650,
      flaeche_m2: 55.5,
      zimmer: 2,
      url: 'https://example.at/wh-123',
      datum_erfasst: '2026-07-02',
    });
  });
});

describe('kriterienZusammenfassung', () => {
  it('formatiert alle Kriterien kompakt', () => {
    const text = kriterienZusammenfassung({
      bundesland: 'kaernten',
      typ: 'kauf',
      preisMin: 100000,
      preisMax: 300000,
      flaecheMin: 50,
      zimmerMax: 4,
      ort: 'Villach',
    });
    // Tausender-Gruppierung je nach ICU (de-AT: geschütztes Leerzeichen)
    const nf = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });
    expect(text).toBe(
      `Kärnten · Kauf · ${nf.format(100000)}–${nf.format(300000)} € · ab 50 m² · bis 4 Zi. · Villach`,
    );
  });

  it('lässt fehlende Kriterien weg', () => {
    expect(kriterienZusammenfassung({ bundesland: 'wien', typ: 'beide' })).toBe('Wien · Kauf & Miete');
  });
});

describe('migrationsVersion', () => {
  it('liest die führende Nummer', () => {
    expect(migrationsVersion('001_schema.sql')).toBe(1);
    expect(migrationsVersion('012_neue_spalte.sql')).toBe(12);
  });

  it('wirft bei Dateien ohne Nummer', () => {
    expect(() => migrationsVersion('schema.sql')).toThrow('beginnt nicht mit einer Nummer');
  });
});
