import { describe, expect, it } from 'vitest';
import {
  renderDashboardOhneDatenSeite,
  renderDashboardSeite,
  type DashboardDaten,
} from '../src/pages/dashboard-page.js';
import { parseDashboardFilter, parseDatenpunkteSeiten, parseStichtag } from '../src/search.js';
import type { StichtagDatenpunkt } from '../src/trend.js';

function datenpunkt(overrides: Partial<StichtagDatenpunkt> = {}): StichtagDatenpunkt {
  return {
    ort: 'Klagenfurt',
    plz: '9020',
    zimmer: 3,
    flaecheM2: 50,
    preis: 200000,
    eurM2: 4000,
    portal: 'willhaben.at',
    inseratId: 'wh-1',
    url: 'https://willhaben.at/wh-1',
    anzahlInserate: 1,
    ...overrides,
  };
}

function daten(overrides: Partial<DashboardDaten> = {}): DashboardDaten {
  return {
    stichtag: '2026-07-07',
    sweepBeendetAm: new Date('2026-07-07T04:30:00Z'),
    portalAusfaelle: [],
    sweepLaeuft: false,
    inserateImLauf: { kauf: 2802, miete: 669 },
    trend: [
      { datum: '2026-06-30', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 40, anzahlMiete: 30 },
      { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
    ],
    renditeTrend: [
      { datum: '2026-06-30', bruttoRendite: 0.0302 },
      { datum: '2026-07-07', bruttoRendite: 0.03 },
    ],
    filter: {},
    zielRendite: 0.04,
    datenpunkte: { kauf: [datenpunkt()], miete: [] },
    streuung: [
      { datum: '2026-06-30', kauf: [3600.4, 4200], miete: [9.816] },
      { datum: '2026-07-07', kauf: [4000], miete: [10] },
    ],
    datenpunkteStichtag: '2026-07-07',
    datenpunkteOffen: false,
    datenpunkteSeiten: { kauf: 1, miete: 1 },
    ...overrides,
  };
}

describe('renderDashboardSeite', () => {
  it('zeigt KPIs mit Urteil: Rendite unter Ziel ohne Good-Kachel', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('3,00 %');
    expect(html).toContain('unter Ziel (≥ 4 %)');
    expect(html).not.toContain('class="tile tile-good"'); // CSS-Regel zählt nicht
    expect(html).toContain('4 000 €/m²'); // de-AT gruppiert mit NBSP
    expect(html).toContain('10,00 €/m²');
    expect(html).toContain('42 aktive Kauf-Objekte');
  });

  it('zeigt die Roh-Inserate des Laufs (Kauf/Miete) an der Sweep-Kachel', () => {
    const html = renderDashboardSeite(daten());
    // de-AT gruppiert mit NBSP (U+00A0).
    expect(html).toContain('2 802 Kauf- · 669 Miet-Inserate im Lauf');
    expect(html).toContain('Roh-Inserate vor Deduplizierung');
  });

  it('formatiert die Chart-Labels als dd.mm.yyyy (serverseitig vorformatiert)', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('"label":"30.06.2026"');
    expect(html).toContain('"label":"07.07.2026"');
  });

  it('hebt eine Rendite über dem Ziel hervor', () => {
    const html = renderDashboardSeite(
      daten({ renditeTrend: [{ datum: '2026-07-07', bruttoRendite: 0.045 }] }),
    );
    expect(html).toContain('class="tile tile-good"');
    expect(html).toContain('Ziel ≥ 4 % erreicht');
  });

  it('spiegelt aktive Filter in der Überschrift und escapt die Eingaben', () => {
    const html = renderDashboardSeite(daten({ filter: { plz: '9020', flaecheMin: 45, flaecheMax: 90 } }));
    expect(html).toContain('Wohnungsmarkt Kärnten · PLZ 9020 · 45–90 m²');
    expect(html).toContain('value="9020"');
    expect(html).toContain('Filter zurücksetzen');
  });

  it('warnt bei Portal-Ausfällen des Stichtag-Sweeps', () => {
    const html = renderDashboardSeite(daten({ portalAusfaelle: ['willhaben.at Hermagor: 403'] }));
    expect(html).toContain('nicht abfragbar');
    expect(html).toContain('href="/crawl"');
  });

  it('serialisiert die Zeitreihen "</script>"-sicher ins Chart-Skript', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('const TREND = [');
    expect(html).toContain('const RENDITE = [');
    expect(html).toContain('"bruttoRendite":0.03');
    expect(html).not.toContain('</script><script>alert');
  });

  it('zeigt ohne Objekte im Filter den Leerzustand statt Charts', () => {
    const html = renderDashboardSeite(
      daten({
        trend: [],
        renditeTrend: [],
        filter: { plz: '1010' },
        datenpunkte: { kauf: [], miete: [] },
        datenpunkteStichtag: undefined,
      }),
    );
    expect(html).toContain('Keine Objekte im gewählten Filter');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('id="datenpunkte"');
  });
});

describe('renderDashboardSeite – Datenpunkte-Sektion', () => {
  it('rendert die Sektion zugeklappt, mit Stichtag in der Überschrift', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('id="datenpunkte"');
    expect(html).toContain('<details class="datenpunkte">');
    expect(html).toContain('Datenpunkte (Stichtag 07.07.2026)');
  });

  it('rendert die Streu-Charts und serialisiert die Punktwolke gerundet', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('id="streu-kauf"');
    expect(html).toContain('id="streu-miete"');
    // Kauf auf ganze €, Miete auf Cent gerundet.
    expect(html).toContain('const STREUUNG = [{"datum":"2026-06-30","kauf":[3600,4200],"miete":[9.82]}');
  });

  it('rendert die Sektion aufgeklappt, wenn ?stichtag gesetzt war', () => {
    const html = renderDashboardSeite(daten({ datenpunkteOffen: true }));
    expect(html).toContain('<details class="datenpunkte" open>');
  });

  it('Stichtag-Links tragen Filter, Stichtag und Anker; am Rand steht ein leerer Span', () => {
    const html = renderDashboardSeite(
      daten({ filter: { plz: '9020', flaecheMin: 45 }, datenpunkteOffen: true }),
    );
    // Letzter Stichtag: älterer verlinkt, neuerer nicht.
    expect(html).toContain('href="/?plz=9020&flaeche_min=45&stichtag=2026-06-30#datenpunkte"');
    expect(html).toContain('← älterer Stichtag');
    expect(html).not.toContain('neuerer Stichtag →</a>');
    expect(html).toContain('Stichtag 2 von 2');
  });

  it('verlinkt vom älteren Stichtag zum neueren', () => {
    const html = renderDashboardSeite(daten({ datenpunkteStichtag: '2026-06-30' }));
    expect(html).toContain('href="/?stichtag=2026-07-07#datenpunkte"');
    expect(html).toContain('neuerer Stichtag →');
    expect(html).toContain('Stichtag 1 von 2');
  });

  it('hält die Sektion über die Filterleiste offen (Hidden-Field nur bei offener Sektion)', () => {
    const feld = '<input type="hidden" name="stichtag" value="2026-07-07">';
    expect(renderDashboardSeite(daten({ datenpunkteOffen: true }))).toContain(feld);
    expect(renderDashboardSeite(daten())).not.toContain('name="stichtag"');
  });

  it('zeigt je Serie Anzahl und Median und formatiert die Zeile', () => {
    const html = renderDashboardSeite(
      daten({
        datenpunkte: {
          kauf: [
            datenpunkt({ eurM2: 3600, preis: 180000 }),
            datenpunkt({ inseratId: 'wh-2', eurM2: 4000, anzahlInserate: 2 }),
          ],
          miete: [],
        },
      }),
    );
    expect(html).toContain('Kauf · 2 Objekte · Median 3 800 €/m²');
    expect(html).toContain('<a href="https://willhaben.at/wh-1">Klagenfurt · 3 Zi.</a>');
    expect(html).toContain('180 000 €');
    expect(html).toContain('50 m²');
    expect(html).toContain('2 Inserate (dedupliziert)');
    expect(html).toContain('Keine aktiven Miete-Objekte an diesem Stichtag.');
  });

  it('markiert nur deutlich unter dem Median liegende Punkte als Chance (grün)', () => {
    const html = renderDashboardSeite(
      daten({
        datenpunkte: {
          kauf: [
            datenpunkt({ eurM2: 2000 }), // −33 % → Chance
            datenpunkt({ inseratId: 'wh-2', eurM2: 3000 }), // Median selbst
            datenpunkt({ inseratId: 'wh-3', eurM2: 4000 }), // +33 % → neutral, kein Rot
          ],
          miete: [],
        },
      }),
    );
    expect(html).toContain('<span class="gesenkt">−33,3 %</span>');
    expect(html).not.toContain('class="gestiegen"');
    expect(html).toContain('+33,3 %');
  });

  it('paginiert die Tabellen mit 20 Zeilen und hält die Seite der anderen Serie', () => {
    // 50 Kauf-Punkte (aufsteigend sortiert, wie datenpunkteAmStichtag liefert).
    const kauf = Array.from({ length: 50 }, (_, i) =>
      datenpunkt({ ort: `Ort${i}`, inseratId: `wh-${i}`, eurM2: 3000 + i }),
    );
    const seite1 = renderDashboardSeite(
      daten({ datenpunkte: { kauf, miete: [] }, datenpunkteSeiten: { kauf: 1, miete: 3 } }),
    );
    expect(seite1).toContain('Ort0');
    expect(seite1).toContain('Ort19');
    expect(seite1).not.toContain('Ort20');
    expect(seite1).toContain('Seite 1 von 3');
    // Weiter-Link: eigene Seite hochgezählt, Miete-Seite bleibt, Anker auf die Kauf-Tabelle.
    expect(seite1).toContain('href="/?stichtag=2026-07-07&kauf_seite=2&miete_seite=3#dp-kauf"');

    const seite2 = renderDashboardSeite(
      daten({ datenpunkte: { kauf, miete: [] }, datenpunkteSeiten: { kauf: 2, miete: 1 } }),
    );
    expect(seite2).toContain('Ort20');
    expect(seite2).not.toContain('Ort19<');
    expect(seite2).toContain('Seite 2 von 3');
    // Median steht auf beiden Seiten gleich (über alle Punkte, nicht die Seite).
    const medianKopf = /Kauf · 50 Objekte · Median [\d ]+ €\/m²/;
    expect(seite1).toMatch(medianKopf);
    expect(seite2).toMatch(medianKopf);
  });

  it('klemmt eine zu große Tabellen-Seite auf die letzte und lässt die Nav bei einer Seite weg', () => {
    const kauf = Array.from({ length: 50 }, (_, i) =>
      datenpunkt({ ort: `Ort${i}`, inseratId: `wh-${i}`, eurM2: 3000 + i }),
    );
    const html = renderDashboardSeite(
      daten({ datenpunkte: { kauf, miete: [] }, datenpunkteSeiten: { kauf: 99, miete: 1 } }),
    );
    expect(html).toContain('Seite 3 von 3');
    expect(html).toContain('Ort40');
    // Nur 1 Datenpunkt (Default-Fixture) → keine Seiten-Nav an der Tabelle.
    const eineSeite = renderDashboardSeite(daten());
    expect(eineSeite).not.toContain('Datenpunkte: Seiten');
  });

  it('escapt Ort und URL der Datenpunkte', () => {
    const html = renderDashboardSeite(
      daten({
        datenpunkte: {
          kauf: [datenpunkt({ ort: '<b>Ort</b>', url: 'https://x.at/?a="1"' })],
          miete: [],
        },
      }),
    );
    expect(html).not.toContain('<b>Ort</b>');
    expect(html).toContain('&lt;b&gt;Ort&lt;/b&gt;');
    expect(html).toContain('https://x.at/?a=&quot;1&quot;');
  });
});

describe('renderDashboardOhneDatenSeite', () => {
  it('unterscheidet "läuft gerade" von "steht aus"', () => {
    expect(renderDashboardOhneDatenSeite(true)).toContain('läuft gerade');
    expect(renderDashboardOhneDatenSeite(false)).toContain('steht noch aus');
  });
});

describe('parseDashboardFilter', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('akzeptiert PLZ-Präfixe (1–4 Ziffern) und verwirft Unfug still', () => {
    expect(parseDashboardFilter(params('plz=9020'))).toEqual({ plz: '9020' });
    expect(parseDashboardFilter(params('plz=9'))).toEqual({ plz: '9' });
    expect(parseDashboardFilter(params('plz=90201'))).toEqual({});
    expect(parseDashboardFilter(params('plz=abc'))).toEqual({});
    expect(parseDashboardFilter(params(''))).toEqual({});
  });

  it('parst den m²-Bereich nachsichtig (Komma, Negatives verworfen, verdreht → getauscht)', () => {
    expect(parseDashboardFilter(params('flaeche_min=45&flaeche_max=90'))).toEqual({
      flaecheMin: 45,
      flaecheMax: 90,
    });
    expect(parseDashboardFilter(params('flaeche_min=45,5'))).toEqual({ flaecheMin: 45.5 });
    expect(parseDashboardFilter(params('flaeche_min=-3&flaeche_max=quatsch'))).toEqual({});
    expect(parseDashboardFilter(params('flaeche_min=90&flaeche_max=45'))).toEqual({
      flaecheMin: 45,
      flaecheMax: 90,
    });
  });
});

describe('parseStichtag', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('akzeptiert YYYY-MM-DD und verwirft Unfug still', () => {
    expect(parseStichtag(params('stichtag=2026-06-30'))).toBe('2026-06-30');
    expect(parseStichtag(params('stichtag=30.06.2026'))).toBeUndefined();
    expect(parseStichtag(params('stichtag=quatsch'))).toBeUndefined();
    expect(parseStichtag(params('stichtag='))).toBeUndefined();
    expect(parseStichtag(params(''))).toBeUndefined();
  });
});

describe('parseDatenpunkteSeiten', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('akzeptiert positive Ganzzahlen, alles andere wird Seite 1', () => {
    expect(parseDatenpunkteSeiten(params('kauf_seite=3&miete_seite=2'))).toEqual({ kauf: 3, miete: 2 });
    expect(parseDatenpunkteSeiten(params('kauf_seite=0'))).toEqual({ kauf: 1, miete: 1 });
    expect(parseDatenpunkteSeiten(params('kauf_seite=-2&miete_seite=1.5'))).toEqual({ kauf: 1, miete: 1 });
    expect(parseDatenpunkteSeiten(params('kauf_seite=quatsch'))).toEqual({ kauf: 1, miete: 1 });
    expect(parseDatenpunkteSeiten(params(''))).toEqual({ kauf: 1, miete: 1 });
  });
});
