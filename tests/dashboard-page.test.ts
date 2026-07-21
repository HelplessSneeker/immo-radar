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
    istAusreisser: false,
    ...overrides,
  };
}

function daten(overrides: Partial<DashboardDaten> = {}): DashboardDaten {
  return {
    stichtag: '2026-07-07',
    portalAusfaelle: [],
    trend: [
      { datum: '2026-06-30', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 40, anzahlMiete: 30 },
      { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
    ],
    renditeTrend: [
      { datum: '2026-06-30', bruttoRendite: 0.0302 },
      { datum: '2026-07-07', bruttoRendite: 0.03 },
    ],
    // Ohne Drawer-Toggle identisch zum Trend (beide Schalter stehen auf aus).
    datenpunkteTrend: [
      { datum: '2026-06-30', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 40, anzahlMiete: 30 },
      { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
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
    // Die Einheit steht abgesetzt neben dem 30px-Wert (tile-einheit).
    expect(html).toContain('3,00<span class="tile-einheit">%</span>');
    expect(html).toContain('unter Ziel (≥ 4 %)');
    expect(html).not.toContain('class="tile tile-good"'); // CSS-Regel zählt nicht
    expect(html).toContain('4 000<span class="tile-einheit">€/m²</span>'); // de-AT gruppiert mit NBSP
    expect(html).toContain('10,00<span class="tile-einheit">€/m²</span>');
    expect(html).toContain('42 Objekte');
  });

  it('Provenienz ist eine leise Zeile: Rechenweise + Methodik, keine Roh-Zählungen', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('Ohne Ausreißer gerechnet');
    expect(html).toContain('Alle Kennzahlen erklärt');
    // Roh-Inserate und Sweep-Status leben auf /crawl (der Navbar-Chip zeigt
    // Laufendes live) — die Seite wiederholt sie nicht.
    expect(html).not.toContain('roh, vor Deduplizierung');
    expect(html).not.toContain('Letzter Sweep</div>');
    expect(html).not.toContain('nächster Sweep läuft gerade');
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

  it('aktive Filter öffnen die Filter-Sektion und benennen sich in der Summary', () => {
    const html = renderDashboardSeite(daten({ filter: { plz: '9020', flaecheMin: 45, flaecheMax: 90 } }));
    expect(html).toContain('<h1>Wohnungsmarkt Kärnten</h1>');
    expect(html).toContain('<details class="filter" open>');
    expect(html).toContain('Gefiltert: PLZ 9020 · 45–90 m²');
    expect(html).toContain('value="9020"');
    expect(html).toContain('Filter zurücksetzen');
    // Ohne aktiven Filter bleibt der Filter zugeklappt: die Seite beginnt
    // mit den Zahlen, die Summary heißt schlicht "Filtern".
    const ohneFilter = renderDashboardSeite(daten());
    expect(ohneFilter).toContain('<details class="filter">');
    expect(ohneFilter).toContain('<summary>Filtern</summary>');
    expect(ohneFilter).not.toContain('Gefiltert:');
  });

  it('rendert den Ausreißer-Schalter: default aus und Kennzahlen als bereinigt beschriftet', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('name="ausreisser" value="an">');
    expect(html).not.toContain('name="ausreisser" value="an" checked');
    expect(html).toContain('Ohne Ausreißer gerechnet');
    expect(html).toContain('(ohne Ausreißer)');
    expect(html).not.toContain('Filter zurücksetzen');
    expect(html).toContain('href="/methodik#ausreisser"');
  });

  it('checked bei ?ausreisser=an; der Reset-Link erscheint auch für den Schalter allein', () => {
    const html = renderDashboardSeite(daten({ filter: { ausreisserEinbeziehen: true } }));
    expect(html).toContain('name="ausreisser" value="an" checked');
    // KPIs und Chart-Meta folgen dem globalen Schalter; der Drawer-Serie-Kopf
    // hat seinen eigenen (hier aus) und darf weiter "(ohne Ausreißer)" sagen.
    expect(html).not.toContain('Median der aktiven Objekte (ohne Ausreißer)');
    expect(html).not.toContain('Ohne Ausreißer gerechnet');
    expect(html).toContain('(Ausreißer einbezogen)');
    expect(html).toContain('Filter zurücksetzen');
    // Der Schalter gehört nicht in die Überschrift (nur PLZ/m² beschreiben die Marktsicht).
    expect(html).toContain('<h1>Wohnungsmarkt Kärnten</h1>');
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
    expect(html).toContain('Die Objekte hinter den Zahlen (Stichtag 07.07.2026)');
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
    // Das Feld in der FILTERLEISTE (direkt nach dem Form-Tag) erscheint nur
    // bei offener Sektion; das Drawer-Toggle-Formular trägt stichtag immer.
    const feld =
      '<form class="filterleiste" method="get" action="/">\n      <input type="hidden" name="stichtag" value="2026-07-07">';
    expect(renderDashboardSeite(daten({ datenpunkteOffen: true }))).toContain(feld);
    expect(renderDashboardSeite(daten())).not.toContain(feld);
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

  it('zeigt das Baujahr in der Unterzeile, ohne Angabe fehlt es', () => {
    const html = renderDashboardSeite(
      daten({
        datenpunkte: {
          kauf: [datenpunkt({ baujahr: 1990 }), datenpunkt({ inseratId: 'wh-2', eurM2: 4100 })],
          miete: [],
        },
      }),
    );
    // Ohne Tausenderpunkt ("Bj. 1990", nicht "Bj. 1.990").
    expect(html).toContain('· Bj. 1990');
    expect(html).not.toContain('Bj. 1.990');
    expect(html.match(/· Bj\. /g)).toHaveLength(1); // wh-2 hat keine Angabe
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

  it('blendet Ausreißer-Zeilen per Default aus und zeigt sie erst mit dem Drawer-Schalter markiert', () => {
    const datenpunkte = {
      kauf: [
        // −75 % unter dem bereinigten Median → wäre Chance, ist aber Ausreißer.
        datenpunkt({ eurM2: 1000, istAusreisser: true }),
        datenpunkt({ inseratId: 'wh-2', eurM2: 3900 }),
        datenpunkt({ inseratId: 'wh-3', eurM2: 4100 }),
      ],
      miete: [],
    };
    // Default (Schalter aus): der Ausreißer verschwindet aus der Tabelle.
    const bereinigt = renderDashboardSeite(daten({ datenpunkte }));
    expect(bereinigt).not.toContain('▲ Ausreißer');
    expect(bereinigt).not.toContain('class="row-outlier"');
    expect(bereinigt).not.toContain('class="gesenkt"');
    // Median ohne den geflaggten Punkt: (3900+4100)/2; Kopf nennt die Ausgeblendeten.
    expect(bereinigt).toContain(
      'Kauf · 2 Objekte · 1 Ausreißer ausgeblendet · Median 4 000 €/m² (ohne Ausreißer)',
    );

    const einbezogen = renderDashboardSeite(
      daten({ datenpunkte, filter: { objekteAusreisserEinbeziehen: true } }),
    );
    expect(einbezogen).toContain('▲ Ausreißer'); // Badge bleibt sichtbar
    expect(einbezogen).toContain('Kauf · 3 Objekte · davon 1 Ausreißer · Median 3 900 €/m²');
    expect(einbezogen).not.toContain('€/m² (ohne Ausreißer)'); // Serie-Kopf ohne Suffix
  });

  it('nennt den Hard-Regel-Grund neben dem Badge; rein statistische Ausreißer bleiben ohne Grund', () => {
    const datenpunkte = {
      kauf: [
        datenpunkt({ eurM2: 24, istAusreisser: true, datenqualitaet: 'flaeche_ausreisser' }),
        datenpunkt({ inseratId: 'wh-2', eurM2: 20000, istAusreisser: true }),
        datenpunkt({ inseratId: 'wh-3', eurM2: 4100 }),
      ],
      miete: [],
    };
    // Badges erscheinen nur mit gesetztem Drawer-Schalter (Default blendet aus).
    const html = renderDashboardSeite(
      daten({ datenpunkte, filter: { objekteAusreisserEinbeziehen: true } }),
    );
    expect(html).toContain('▲ Ausreißer · Fläche unplausibel</span>');
    expect(html).toContain('▲ Ausreißer</span>'); // der IQR-Fall ohne Grund
  });

  it('Stichtag- und Seiten-Links führen ?ausreisser=an mit', () => {
    const kauf = Array.from({ length: 50 }, (_, i) =>
      datenpunkt({ ort: `Ort${i}`, inseratId: `wh-${i}`, eurM2: 3000 + i }),
    );
    const html = renderDashboardSeite(
      daten({
        filter: { ausreisserEinbeziehen: true },
        datenpunkte: { kauf, miete: [] },
        datenpunkteOffen: true,
      }),
    );
    expect(html).toContain('href="/?ausreisser=an&stichtag=2026-06-30#datenpunkte"');
    expect(html).toContain('href="/?ausreisser=an&stichtag=2026-07-07&kauf_seite=2#dp-kauf"');
  });

  it('der Serien-Median ist vom globalen Schalter unabhängig — in beide Richtungen', () => {
    const datenpunkte = {
      kauf: [
        datenpunkt({ eurM2: 1000, istAusreisser: true }),
        datenpunkt({ inseratId: 'wh-2', eurM2: 3900 }),
        datenpunkt({ inseratId: 'wh-3', eurM2: 4100 }),
      ],
      miete: [],
    };
    // Globaler Schalter an, Drawer aus → Tabellen-Median bleibt bereinigt.
    const globalAn = renderDashboardSeite(
      daten({ datenpunkte, filter: { ausreisserEinbeziehen: true } }),
    );
    expect(globalAn).toContain('Median 4 000 €/m² (ohne Ausreißer)');
    // Drawer an, global aus → Tabellen-Median einbezogen, KPIs bleiben bereinigt.
    const drawerAn = renderDashboardSeite(
      daten({ datenpunkte, filter: { objekteAusreisserEinbeziehen: true } }),
    );
    expect(drawerAn).toContain('Median 3 900 €/m²');
    expect(drawerAn).not.toContain('€/m² (ohne Ausreißer)'); // Serie-Kopf ohne Suffix
    expect(drawerAn).toContain('Ohne Ausreißer gerechnet'); // Provenienz-Zeile der KPIs
    expect(drawerAn).toContain('Median der aktiven Objekte (ohne Ausreißer)'); // Chart-Meta
  });

  it('blendet eine komplett geflaggte Serie ganz aus statt zu crashen', () => {
    // Hard-Regel-Flags kennen kein n≥4-Minimum: eine Serie kann komplett aus
    // Ausreißern bestehen. Bei ausgeblendeten Ausreißern bleibt nichts übrig —
    // kein 500er, sondern ein eigener Hinweis-Block.
    const datenpunkte = {
      kauf: [datenpunkt({ eurM2: 24, istAusreisser: true, datenqualitaet: 'flaeche_ausreisser' })],
      miete: [],
    };
    const html = renderDashboardSeite(daten({ datenpunkte }));
    expect(html).toContain('Kauf · 1 Objekte · alle Ausreißer</h3>');
    expect(html).toContain('sind Ausreißer und');
    expect(html).not.toContain('▲ Ausreißer'); // keine Tabellenzeile
    // Mit dem Drawer-Schalter erscheint die Zeile wieder samt (unbereinigtem) Median.
    const einbezogen = renderDashboardSeite(
      daten({ datenpunkte, filter: { objekteAusreisserEinbeziehen: true } }),
    );
    expect(einbezogen).toContain('Median 24 €/m²');
    expect(einbezogen).not.toContain('alle Ausreißer</h3>');
  });

  it('Drawer-Toggle: GET-Form hält Filter, Stichtag und Seiten als Hidden-Felder', () => {
    const html = renderDashboardSeite(
      daten({ filter: { plz: '9020', ausreisserEinbeziehen: true }, datenpunkteOffen: true }),
    );
    expect(html).toContain('class="drawer-toggle feld-toggle" method="get" action="/#datenpunkte"');
    expect(html).toContain('name="objekte_ausreisser" value="an">'); // Checkbox, default aus
    expect(html).not.toContain('name="objekte_ausreisser" value="an" checked');
    // Hidden-Felder: Filter und Stichtag überleben das Absenden.
    expect(html).toContain('<input type="hidden" name="plz" value="9020">');
    expect(html).toContain('<input type="hidden" name="ausreisser" value="an">');
    expect(html).toContain('<input type="hidden" name="stichtag" value="2026-07-07">');

    const an = renderDashboardSeite(daten({ filter: { objekteAusreisserEinbeziehen: true } }));
    expect(an).toContain('name="objekte_ausreisser" value="an" checked');
  });

  it('Stichtag-/Seiten-Links und Filterleiste führen ?objekte_ausreisser=an mit', () => {
    const kauf = Array.from({ length: 50 }, (_, i) =>
      datenpunkt({ ort: `Ort${i}`, inseratId: `wh-${i}`, eurM2: 3000 + i }),
    );
    const html = renderDashboardSeite(
      daten({
        filter: { objekteAusreisserEinbeziehen: true },
        datenpunkte: { kauf, miete: [] },
        datenpunkteOffen: true,
      }),
    );
    expect(html).toContain('href="/?objekte_ausreisser=an&stichtag=2026-06-30#datenpunkte"');
    expect(html).toContain('href="/?objekte_ausreisser=an&stichtag=2026-07-07&kauf_seite=2#dp-kauf"');
    // Die Haupt-Filterleiste trägt den Drawer-Schalter als Hidden-Feld weiter.
    expect(html).toContain('<input type="hidden" name="objekte_ausreisser" value="an">');
  });

  it('serialisiert die Drawer-Median-Serie (DP_TREND) getrennt vom Trend', () => {
    const html = renderDashboardSeite(
      daten({
        datenpunkteTrend: [
          { datum: '2026-06-30', medianKaufEurM2: 3500, medianMieteEurM2: 9.5, anzahlKauf: 41, anzahlMiete: 31 },
          { datum: '2026-07-07', medianKaufEurM2: 3600, medianMieteEurM2: 9.6, anzahlKauf: 43, anzahlMiete: 32 },
        ],
      }),
    );
    expect(html).toContain(
      'const DP_TREND = [{"medianKaufEurM2":3500,"medianMieteEurM2":9.5},{"medianKaufEurM2":3600,"medianMieteEurM2":9.6}];',
    );
    // Die Wolken-Median-Linie zeichnet aus DP_TREND, nicht aus TREND.
    expect(html).toContain('data: DP_TREND.map((t, i) => ({ x: i, y: medianVon(t) }))');
  });

  it('aliast DP_TREND auf TREND, wenn der Server dieselbe Serie durchreicht', () => {
    // Beide Schalter gleich → server.ts übergibt dasselbe Array; die Seite
    // dupliziert die Mediane dann nicht als zweite JSON-Kopie.
    const trend = [
      { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
    ];
    const html = renderDashboardSeite(
      daten({ trend, datenpunkteTrend: trend, renditeTrend: [{ datum: '2026-07-07', bruttoRendite: 0.03 }] }),
    );
    expect(html).toContain('const DP_TREND = TREND;');
    expect(html).not.toContain('const DP_TREND = [');
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

describe('renderDashboardSeite – Zeitraum-Filter & Trend-Pfeile', () => {
  it('Default: Preset "Alle" checked, Datumsfelder leer, kein Reset-Link', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('name="zeitraum" value="alle" checked');
    expect(html).toContain('name="zeitraum" value="7d">');
    expect(html).toContain('name="zeitraum" value="30d">');
    expect(html).toContain('name="zeitraum" value="90d">');
    expect(html).toContain('name="von" value=""');
    expect(html).toContain('name="bis" value=""');
    expect(html).not.toContain('Filter zurücksetzen');
  });

  it('aktives Preset ist checked und zeigt den Reset-Link', () => {
    const html = renderDashboardSeite(daten({ filter: { zeitraum: { preset: '30d' } } }));
    expect(html).toContain('name="zeitraum" value="30d" checked');
    expect(html).not.toContain('value="alle" checked');
    expect(html).toContain('Filter zurücksetzen');
  });

  it('endet der Zeitraum vor dem Seiten-Stichtag, nennen die Kacheln den Stand des Werts', () => {
    // Seiten-Stichtag 14.07., geklemmter Trend endet 07.07. (Custom-Zeitraum
    // in der Vergangenheit): "aktive Objekte" darf nicht als heute lesbar sein.
    const html = renderDashboardSeite(
      daten({
        stichtag: '2026-07-14',
        filter: { zeitraum: { von: '2026-06-01', bis: '2026-07-07' } },
      }),
    );
    expect(html).toContain('42 Objekte · Stand 07.07.2026');
    expect(html).toContain('31 Objekte · Stand 07.07.2026');
    // Die Rendite-Kachel hat sonst keine Sub-Zeile — beim geklemmten
    // Zeitraum erscheint sie nur für das Stand-Datum.
    expect(html).toContain('<div class="tile-sub">Stand 07.07.2026</div>');
    // Ohne Klemmen (Stichtag = letzter Trend-Punkt) kein Stand-Zusatz an den
    // Kacheln (die Kopfzeile "… · Stand <Stichtag>" zählt nicht).
    expect(renderDashboardSeite(daten())).not.toContain('Objekte · Stand');
  });

  it('Custom Von/Bis: kein Preset checked, Datumsfelder befüllt', () => {
    const html = renderDashboardSeite(
      daten({ filter: { zeitraum: { von: '2026-06-01', bis: '2026-07-07' } } }),
    );
    expect(html).not.toContain('checked>');
    expect(html).not.toContain(' checked'); // kein Radio und kein Ausreißer-Haken
    expect(html).toContain('name="von" value="2026-06-01"');
    expect(html).toContain('name="bis" value="2026-07-07"');
    expect(html).toContain('Filter zurücksetzen');
  });

  it('KPI-Kacheln: Pfeil, textliches Delta und Referenz-Datum', () => {
    const html = renderDashboardSeite(daten());
    // Kauf: 3900 → 4000 = +2,6 %, neutraler Pfeil ohne Urteils-Klasse.
    expect(html).toContain(
      '<span class="trend-pfeil" aria-label="steigend">↑</span> <span class="trend-delta">+2,6 %</span> <span class="trend-ref">vs. 30.06.2026</span>',
    );
    // Miete: 9,8 → 10 = +2,0 %.
    expect(html).toContain('<span class="trend-delta">+2,0 %</span>');
    // Rendite: 3,02 % → 3,00 % = −0,02 %-Pkt. → unter der Schwelle, stabil.
    expect(html).toContain('<span class="trend-pfeil" aria-label="stabil">→</span>');
    expect(html).toContain('±0,0 %-Pkt.');
    // Keine Urteils-Klasse an einem Pfeil (die CSS-Regeln stehen immer im Head).
    expect(html).not.toContain('class="trend-pfeil trend-pfeil-gut"');
    expect(html).not.toContain('class="trend-pfeil trend-pfeil-schlecht"');
  });

  it('Rendite-Pfeil urteilt: gestiegen grün, gefallen rot — in %-Punkten', () => {
    const gestiegen = renderDashboardSeite(
      daten({
        renditeTrend: [
          { datum: '2026-06-30', bruttoRendite: 0.03 },
          { datum: '2026-07-07', bruttoRendite: 0.035 },
        ],
      }),
    );
    expect(gestiegen).toContain(
      '<span class="trend-pfeil trend-pfeil-gut" aria-label="steigend">↑</span>',
    );
    expect(gestiegen).toContain('+0,5 %-Pkt.');

    const gefallen = renderDashboardSeite(
      daten({
        renditeTrend: [
          { datum: '2026-06-30', bruttoRendite: 0.035 },
          { datum: '2026-07-07', bruttoRendite: 0.03 },
        ],
      }),
    );
    expect(gefallen).toContain(
      '<span class="trend-pfeil trend-pfeil-schlecht" aria-label="fallend">↓</span>',
    );
    expect(gefallen).toContain('−0,5 %-Pkt.');
    // Preis-Pfeile bleiben auch bei fallenden Preisen ohne Urteils-Klasse.
    const preiseGefallen = renderDashboardSeite(
      daten({
        trend: [
          { datum: '2026-06-30', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 40, anzahlMiete: 30 },
          { datum: '2026-07-07', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 42, anzahlMiete: 31 },
        ],
      }),
    );
    expect(preiseGefallen).toContain('<span class="trend-pfeil" aria-label="fallend">↓</span>');
    expect(preiseGefallen).toContain('−2,5 %');
  });

  it('bei nur einem Trend-Punkt: Fallback-Text statt Pfeil', () => {
    const html = renderDashboardSeite(
      daten({
        trend: [
          { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
        ],
        renditeTrend: [{ datum: '2026-07-07', bruttoRendite: 0.03 }],
      }),
    );
    expect(html).toContain('zu wenig Daten für Trend');
    expect(html).not.toContain('class="trend-pfeil"');
  });

  it('Stichtag-Links führen den Zeitraum mit (Preset und Custom)', () => {
    const preset = renderDashboardSeite(
      daten({ filter: { zeitraum: { preset: '30d' } }, datenpunkteOffen: true }),
    );
    expect(preset).toContain('href="/?zeitraum=30d&stichtag=2026-06-30#datenpunkte"');

    const custom = renderDashboardSeite(
      daten({
        filter: { zeitraum: { von: '2026-06-01', bis: '2026-07-07' } },
        datenpunkteOffen: true,
      }),
    );
    expect(custom).toContain(
      'href="/?von=2026-06-01&bis=2026-07-07&stichtag=2026-06-30#datenpunkte"',
    );
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

  it('?ausreisser=an schaltet die Einbeziehung an; alles andere lässt das Feld weg', () => {
    expect(parseDashboardFilter(params('ausreisser=an'))).toEqual({ ausreisserEinbeziehen: true });
    expect(parseDashboardFilter(params('ausreisser=AN'))).toEqual({ ausreisserEinbeziehen: true });
    expect(parseDashboardFilter(params('ausreisser=aus'))).toEqual({});
    expect(parseDashboardFilter(params('ausreisser=quatsch'))).toEqual({});
    expect(parseDashboardFilter(params('ausreisser='))).toEqual({});
    expect(parseDashboardFilter(params(''))).toEqual({});
    expect(parseDashboardFilter(params('plz=9020&ausreisser=an'))).toEqual({
      plz: '9020',
      ausreisserEinbeziehen: true,
    });
  });

  it('?objekte_ausreisser=an schaltet den Drawer-Schalter an — unabhängig vom globalen', () => {
    expect(parseDashboardFilter(params('objekte_ausreisser=an'))).toEqual({
      objekteAusreisserEinbeziehen: true,
    });
    expect(parseDashboardFilter(params('objekte_ausreisser=AN'))).toEqual({
      objekteAusreisserEinbeziehen: true,
    });
    expect(parseDashboardFilter(params('objekte_ausreisser=aus'))).toEqual({});
    expect(parseDashboardFilter(params('objekte_ausreisser=quatsch'))).toEqual({});
    expect(parseDashboardFilter(params('objekte_ausreisser='))).toEqual({});
    // Beide Schalter koexistieren, keiner impliziert den anderen.
    expect(parseDashboardFilter(params('ausreisser=an&objekte_ausreisser=an'))).toEqual({
      ausreisserEinbeziehen: true,
      objekteAusreisserEinbeziehen: true,
    });
    expect(parseDashboardFilter(params('ausreisser=an'))).toEqual({
      ausreisserEinbeziehen: true,
    });
  });

  it('?zeitraum=Preset case-insensitiv; Unfug wird still verworfen', () => {
    expect(parseDashboardFilter(params('zeitraum=7d'))).toEqual({ zeitraum: { preset: '7d' } });
    expect(parseDashboardFilter(params('zeitraum=30D'))).toEqual({ zeitraum: { preset: '30d' } });
    // 'alle' ist der Default und wird normalisiert (kein Sonderzustand).
    expect(parseDashboardFilter(params('zeitraum=alle'))).toEqual({});
    expect(parseDashboardFilter(params('zeitraum=quatsch'))).toEqual({});
    expect(parseDashboardFilter(params('zeitraum='))).toEqual({});
  });

  it('von/bis nur paarweise und gültig; sonst still verworfen', () => {
    expect(parseDashboardFilter(params('von=2026-06-01&bis=2026-07-01'))).toEqual({
      zeitraum: { von: '2026-06-01', bis: '2026-07-01' },
    });
    expect(parseDashboardFilter(params('von=2026-06-01'))).toEqual({});
    expect(parseDashboardFilter(params('bis=2026-07-01'))).toEqual({});
    expect(parseDashboardFilter(params('von=2026-07-01&bis=2026-06-01'))).toEqual({}); // von > bis
    expect(parseDashboardFilter(params('von=quatsch&bis=2026-07-01'))).toEqual({});
    expect(parseDashboardFilter(params('von=01.06.2026&bis=2026-07-01'))).toEqual({});
    expect(parseDashboardFilter(params('von=2026-13-40&bis=2026-13-41'))).toEqual({}); // Format ok, kein Datum
    expect(parseDashboardFilter(params('von=&bis='))).toEqual({});
  });

  it('vollständiges von/bis schlägt das Preset; unvollständiges lässt es gelten', () => {
    expect(parseDashboardFilter(params('zeitraum=7d&von=2026-06-01&bis=2026-07-01'))).toEqual({
      zeitraum: { von: '2026-06-01', bis: '2026-07-01' },
    });
    expect(parseDashboardFilter(params('zeitraum=7d&von=2026-06-01'))).toEqual({
      zeitraum: { preset: '7d' },
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
