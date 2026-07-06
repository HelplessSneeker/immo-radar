import { describe, expect, it } from 'vitest';
import { hatPortalAusfall, renderGebieteSeite, renderGebietSeite } from '../src/pages/gebiete-pages.js';
import type { GebietSeitenDaten } from '../src/pages/gebiete-pages.js';
import type { BestandInserat } from '../src/db/bestand-repo.js';
import type { CrawlLauf, Gebiet } from '../src/db/gebiete-repo.js';

let laufendeInseratId = 0;

function macheInserat(overrides: Partial<BestandInserat> = {}): BestandInserat {
  laufendeInseratId += 1;
  return {
    id: `T-${laufendeInseratId}`,
    portal: 'willhaben',
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: 150000,
    flaeche_m2: 50,
    zimmer: 2,
    datum_erfasst: '2026-06-01',
    zuerstGesehen: '2026-06-01',
    zuletztGesehen: '2026-07-06',
    ...overrides,
  };
}

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

  function macheDaten(lauf: CrawlLauf, overrides: Partial<GebietSeitenDaten> = {}): GebietSeitenDaten {
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
      ...overrides,
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

  it('rendert die Inserats-Sektionen als zugeklappte <details> mit Zeilenzahl', () => {
    const daten = macheDaten(macheLauf('fertig', [OK_ZEILE]), {
      aktive: [macheInserat(), macheInserat()],
      delistete: [macheInserat({ zuletztGesehen: '2026-07-01' })],
    });
    const html = renderGebietSeite(gebiet, daten);
    expect(html).toContain('<details class="klapp-sektion">');
    expect(html).not.toContain('<details class="klapp-sektion" open>');
    expect(html).toContain('Aktive Inserate (2)');
    expect(html).toContain('Kürzlich delistet (1)');
  });

  it('klappt beide Sektionen bei ?inserate=alle auf', () => {
    const daten = macheDaten(macheLauf('fertig', [OK_ZEILE]), {
      aktive: [macheInserat()],
      alleAnzeigen: true,
    });
    const html = renderGebietSeite(gebiet, daten);
    expect(html).toContain('<details class="klapp-sektion" open>');
    expect(html).not.toContain('<details class="klapp-sektion">');
  });

  it('klappt <details> beim Drucken per Print-CSS auf', () => {
    const html = renderGebietSeite(gebiet, macheDaten(macheLauf('fertig', [OK_ZEILE])));
    expect(html).toContain('.klapp-sektion::details-content { content-visibility: visible; }');
  });

  it('zeigt „zuletzt gesehen" mit Stichtags-Sonderdarstellung', () => {
    const daten = macheDaten(macheLauf('fertig', [OK_ZEILE]), {
      aktive: [
        macheInserat({ zuletztGesehen: '2026-07-06' }), // == Stichtag
        macheInserat({ zuletztGesehen: '2026-07-01' }),
      ],
    });
    const html = renderGebietSeite(gebiet, daten);
    expect(html).toContain('<th scope="col">zuletzt gesehen</th>');
    expect(html).toContain('<td>heute (Stichtag)</td>');
    expect(html).toContain('<td>01.07.2026</td>');
  });

  it('verlinkt keinen Einzelgebiet-Marktreport mehr', () => {
    const html = renderGebietSeite(gebiet, macheDaten(macheLauf('fertig', [OK_ZEILE])));
    expect(html).not.toContain('Aktueller Marktreport');
    expect(html).not.toContain(`/gebiete/${gebiet.id}/report`);
  });
});

describe('renderGebieteSeite', () => {
  it('verlinkt den Portfolio-Marktreport im Kopf', () => {
    const html = renderGebieteSeite([], new Set(), new Map(), new Map());
    expect(html).toContain('href="/gebiete/report"');
    expect(html).toContain('Portfolio-Marktreport');
  });
});
