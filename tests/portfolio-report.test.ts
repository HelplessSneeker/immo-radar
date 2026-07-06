import { describe, expect, it } from 'vitest';
import { renderPortfolioReport, type PortfolioGebietDaten } from '../src/pages/gebiete-pages.js';
import type { BestandInserat } from '../src/db/bestand-repo.js';
import type { Gebiet } from '../src/db/gebiete-repo.js';

let laufendeId = 0;

function macheGebiet(name: string, overrides: Partial<Gebiet> = {}): Gebiet {
  laufendeId += 1;
  return {
    id: laufendeId,
    name,
    kriterien: { bundesland: 'kaernten', typ: 'beide' },
    aktiv: true,
    erstelltAm: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function macheInserat(overrides: Partial<BestandInserat> = {}): BestandInserat {
  laufendeId += 1;
  return {
    id: `T-${laufendeId}`,
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

describe('renderPortfolioReport', () => {
  it('gruppiert nach Gebiet-Name statt Ort, mit Quellen-Zeile je Gebiet', () => {
    const teile: PortfolioGebietDaten[] = [
      {
        gebiet: macheGebiet('Kärnten gesamt'),
        stichtag: '2026-07-05',
        aktive: [macheInserat({ ort: 'Villach' }), macheInserat({ ort: 'Feldkirchen' })],
      },
      {
        gebiet: macheGebiet('Klagenfurt Zentrum'),
        stichtag: '2026-07-06',
        aktive: [macheInserat({ ort: 'Klagenfurt' })],
      },
    ];
    const html = renderPortfolioReport(teile);

    // Gruppen sind die Gebiet-Namen; die Orte des Bundesland-Gebiets
    // erscheinen nicht als eigene Gebiete in der Vergleichstabelle.
    expect(html).toContain('Kärnten gesamt');
    expect(html).toContain('Klagenfurt Zentrum');
    expect(html).not.toContain('<th scope="row">Villach');
    expect(html).not.toContain('<th scope="row">Feldkirchen');

    expect(html).toContain('Kärnten gesamt: Bestand, Stand 2026-07-05 (2 aktive Inserate)');
    expect(html).toContain('Klagenfurt Zentrum: Bestand, Stand 2026-07-06 (1 aktive Inserate)');
    expect(html).toContain('Portfolio');
  });

  it('nennt Gebiete ohne fertigen Lauf in den Quellen, ohne sie auszuwerten', () => {
    const teile: PortfolioGebietDaten[] = [
      {
        gebiet: macheGebiet('Klagenfurt Zentrum'),
        stichtag: '2026-07-06',
        aktive: [macheInserat()],
      },
      { gebiet: macheGebiet('Wartendes Gebiet'), aktive: [] },
    ];
    const html = renderPortfolioReport(teile);
    expect(html).toContain('Wartendes Gebiet: noch kein fertiger Crawl-Lauf');
    expect(html).not.toContain('<th scope="row">Wartendes Gebiet');
  });

  it('zeigt ohne Gebiete einen Leerzustand mit Anlege-Hinweis', () => {
    const html = renderPortfolioReport([]);
    expect(html).toContain('lege ein Beobachtungsgebiet an');
    expect(html).toContain('href="/"');
  });

  it('zeigt bei Gebieten ohne Inserate einen Leerzustand mit Hinweis-Liste', () => {
    const html = renderPortfolioReport([{ gebiet: macheGebiet('Wartendes Gebiet'), aktive: [] }]);
    expect(html).toContain('warten auf ihren');
    expect(html).toContain('Wartendes Gebiet: noch kein fertiger Crawl-Lauf');
  });

  it('macht gleichnamige Gebiete über die Gebiet-Nummer unterscheidbar', () => {
    const a = macheGebiet('Zentrum');
    const b = macheGebiet('Zentrum');
    const html = renderPortfolioReport([
      { gebiet: a, stichtag: '2026-07-06', aktive: [macheInserat()] },
      { gebiet: b, stichtag: '2026-07-06', aktive: [macheInserat()] },
    ]);
    expect(html).toContain(`Zentrum (Gebiet ${a.id})`);
    expect(html).toContain(`Zentrum (Gebiet ${b.id})`);
  });
});
