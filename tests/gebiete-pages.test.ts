import { describe, expect, it } from 'vitest';
import { hatPortalAusfall, renderGebietSeite } from '../src/pages/gebiete-pages.js';
import type { GebietSeitenDaten } from '../src/pages/gebiete-pages.js';
import type { CrawlLauf, Gebiet } from '../src/db/gebiete-repo.js';

const AUSFALL_ZEILE = 'willhaben.at Kärnten: nicht abfragbar (Timeout)';
const OK_ZEILE = 'immoscout24.at Kärnten (Kauf: 12 von 12 Inseraten geladen)';

function macheLauf(status: CrawlLauf['status'], quellen: string[]): CrawlLauf {
  return {
    id: 1,
    gebietId: 1,
    laufDatum: '2026-07-06',
    status,
    quellen,
    gestartetAm: new Date('2026-07-06T06:00:00Z'),
    beendetAm: new Date('2026-07-06T06:05:00Z'),
  };
}

describe('hatPortalAusfall', () => {
  it('erkennt einen fertigen Lauf mit ausgefallenem Portal', () => {
    expect(hatPortalAusfall(macheLauf('fertig', [AUSFALL_ZEILE, OK_ZEILE]))).toBe(true);
  });

  it('meldet nichts bei einem fertigen Lauf ohne Ausfall', () => {
    expect(hatPortalAusfall(macheLauf('fertig', [OK_ZEILE, OK_ZEILE]))).toBe(false);
  });

  it('meldet nichts bei fehlgeschlagenen Läufen – die haben ihr eigenes Badge', () => {
    expect(hatPortalAusfall(macheLauf('fehlgeschlagen', [AUSFALL_ZEILE]))).toBe(false);
  });
});

describe('renderGebietSeite', () => {
  const gebiet: Gebiet = {
    id: 1,
    name: 'Klagenfurt',
    kriterien: { bundesland: 'kaernten', typ: 'beide', ort: '9020' },
    aktiv: true,
    erstelltAm: new Date('2026-06-01T00:00:00Z'),
  };

  function macheDaten(lauf: CrawlLauf): GebietSeitenDaten {
    return {
      stichtag: lauf.laufDatum,
      beendetAm: lauf.beendetAm!,
      trend: [],
      vermarktung: { kauf: null, miete: null },
      rendite: null,
      aktive: [],
      delistete: [],
      delistetFensterTage: 14,
      aenderungen: new Map(),
      alleAnzeigen: false,
      laeufe: [lauf],
      laufVeraenderungen: new Map(),
      anzahlDelisted: 0,
    };
  }

  it('markiert Läufe mit Portal-Ausfall in der Läufe-Tabelle', () => {
    const html = renderGebietSeite(gebiet, macheDaten(macheLauf('fertig', [AUSFALL_ZEILE, OK_ZEILE])));
    expect(html).toContain('Portal-Ausfall');
  });

  it('zeigt keinen Marker ohne Ausfall', () => {
    const html = renderGebietSeite(gebiet, macheDaten(macheLauf('fertig', [OK_ZEILE])));
    expect(html).not.toContain('Portal-Ausfall');
  });
});
