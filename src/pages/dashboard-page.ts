import type { DashboardFilter } from '../search.js';
import { median } from '../stats.js';
import {
  berechneKpiDelta,
  berechneRenditeKpiDelta,
  type KpiDelta,
  type RenditeTrendPunkt,
  type StichtagDatenpunkt,
  type StreuungsPunkt,
  type TrendPunkt,
} from '../trend.js';
import {
  ausreisserBadge,
  DELTA_STABIL_SCHWELLE,
  fmtDelta,
  datumMedium,
  nfEur0,
  nfEur2,
  nfPct,
  nfProzent2,
  nfTage,
} from './format.js';
import { escapeHtml, renderOhneDatenSeite, seite } from './layout.js';

/**
 * Die Startseite: der Kärntner Wohnungsmarkt als Zeitreihe — Bruttorendite,
 * Miete/m² und Preis/m² über deduplizierte Objekte, mit dem kleinen
 * PLZ/m²-Filter. Chart-Aufbau und Urteils-Regeln wie die früheren
 * Gebiets-Auswertungen ("Zahl mit Urteil", Kauf=blau/Miete=grün,
 * Rendite als dritte Serie in --series-3).
 */

export interface DashboardDaten {
  /** Stichtag = lauf_datum des letzten fertigen Sweeps. */
  stichtag: string;
  /** Quellen-Zeilen fehlgeschlagener Segmente des Stichtag-Sweeps. */
  portalAusfaelle: string[];
  trend: TrendPunkt[];
  renditeTrend: RenditeTrendPunkt[];
  /**
   * Median-Serie der Datenpunkte-Sektion (Wolken-Median-Linie): dieselben
   * Stichtage wie trend, aber nach dem Drawer-Schalter
   * (objekteAusreisserEinbeziehen) gerechnet statt nach dem globalen.
   */
  datenpunkteTrend: TrendPunkt[];
  filter: DashboardFilter;
  /** Ziel-Bruttorendite (Anteil), ab der die Kachel als "gut" gilt. */
  zielRendite: number;
  /** Datenpunkte der Datenpunkte-Sektion (Objekte hinter dem Stichtag-Median). */
  datenpunkte: { kauf: StichtagDatenpunkt[]; miete: StichtagDatenpunkt[] };
  /** Punktwolke über alle Trend-Stichtage (für die Streu-Charts der Sektion). */
  streuung: StreuungsPunkt[];
  /** Stichtag der Datenpunkte-Sektion (∈ trend); undefined bei leerem Trend. */
  datenpunkteStichtag: string | undefined;
  /** true = ?stichtag war gesetzt → Sektion aufgeklappt rendern. */
  datenpunkteOffen: boolean;
  /** Tabellen-Seiten der Sektion (1-basiert; der Renderer klemmt auf den Bereich). */
  datenpunkteSeiten: { kauf: number; miete: number };
}

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

const DASHBOARD_CSS = `
  /* Dashboard-Rhythmus: Kopf → Filter → KPI-Block bilden die enge
     Antwort-Gruppe (16px Gap), die Verlaufs-Charts setzen sich mit 24px ab,
     Datenpunkte-Tiefe und Footer mit 32px (Gap + margin-top; extraCss ist
     seitenscopiert, andere Seiten behalten den 20px-Basis-Gap). */
  main.breit { gap: 16px; }
  /* Zusammenklappbarer Filter: geschlossen eine schlanke Zeile, offen die
     Filterleiste darunter. Die Summary trägt Akzent als Interaktions-Signal. */
  .filter-sektion { padding: 12px 20px; }
  .filter summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--akzent); }
  .filter summary:hover { text-decoration: underline; }
  .filter[open] summary { margin-bottom: 14px; }
  /* Der Seitenkopf ist Text auf Papier, die Filterkarte die erste Fläche –
     ohne die zusätzliche Luft kleben die zwei Materialien aneinander. */
  header { margin-bottom: 8px; }
  header .meta { margin: 6px 0 0; }
  /* Erklär-Zeilen der Sektionen auf Lesebreite kappen – über die vollen
     1040px läuft eine 13px-Zeile auf ~140 Zeichen. */
  .verlauf > .meta, .datenpunkte > .meta { max-width: 76ch; }
  .verlauf { margin-top: 8px; }
  #datenpunkte { margin-top: 16px; }
  footer { margin-top: 16px; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  /* Mittlere Breiten: 2 Spalten, die Rendite-Kachel (das Urteil) voll breit
     oben — wie bei .charts-3 kein allein danglendes drittes Element. */
  @media (max-width: 820px) {
    .tiles { grid-template-columns: 1fr 1fr; }
    .tiles .tile:first-child { grid-column: 1 / -1; }
  }
  @media (max-width: 560px) {
    .tiles { grid-template-columns: 1fr; }
  }
  /* Warnung und Provenienz sind Sub-Zeilen des Kachel-Grids: enge Bindung
     statt main-Gap. */
  .kpi-block .warnung { margin: 12px 0 0; }
  .kpi-block > .meta { margin: 10px 0 0; }
  /* Kacheln werden vom Grid gleich hoch gemacht; die interne Flex-Verteilung
     drückt die Sub-Zeile (Herkunfts-/Erklär-Text) zuverlässig an den Boden,
     damit unterschiedlich lange Erklärungen nicht als Höhen-Wippe erscheinen. */
  .tile {
    background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px;
    display: flex; flex-direction: column;
  }
  .tile-good { background: var(--good-bg); }
  .tile-label { color: var(--text-secondary); font-size: 13px; margin-bottom: 4px; }
  .tile-value { font-size: 30px; font-weight: 600; line-height: 1.1; margin: 0 0 8px; font-variant-numeric: tabular-nums; }
  /* Einheit vom Wert abgesetzt: die Zahl trägt das Urteil, "%"/"€/m²" ist
     nur ihre Beschriftung – kleiner und gedämpft statt 30px-laut. */
  .tile-einheit { font-size: 16px; font-weight: 400; color: var(--text-secondary); margin-left: 3px; }
  .tile-badge { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
  .tile-badge-good { color: var(--good-text); font-weight: 600; }
  .tile-sub { font-size: 12px; line-height: 1.45; color: var(--text-secondary); margin-top: auto; padding-top: 4px; }
  .charts-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  /* Mittlere Breiten: 2 Spalten, das Rendite-Panel (das Urteils-Chart) voll
     breit oben — statt eines allein danglenden dritten Charts. */
  @media (max-width: 1100px) {
    .charts-3 { grid-template-columns: 1fr 1fr; }
    .charts-3 .chart-box:first-child { grid-column: 1 / -1; }
  }
  @media (max-width: 680px) {
    .charts-3 { grid-template-columns: 1fr; }
  }
  .chart-box { min-width: 0; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  /* Ausfall-Warnung als leiser Hinweis-Streifen: auf dem Papier verfehlt
     13px-Rot AA (4,33:1), auf der Fläche ist es geprüft. Voller Rahmen,
     kein Seitenstreifen (Flach-Regel). */
  .warnung {
    color: var(--status-critical); font-size: 13px;
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 12px;
  }
  .datenpunkte summary { cursor: pointer; }
  .datenpunkte summary h2 { display: inline; margin: 0; transition: color var(--dauer-fein) var(--ease-out); }
  /* Aufklapp-Affordance sichtbar machen: der Titel reagiert wie ein Link. */
  .datenpunkte summary:hover h2 { color: var(--akzent); }
  .datenpunkte h3 { font-size: 13px; font-weight: 600; margin: 20px 0 8px; }
  /* Drawer-eigener Ausreißer-Schalter: eine schlanke Zeile aus Checkbox,
     Anwenden-Button und Erklär-Meta — kein zweites Filterleisten-Gewicht. */
  .drawer-toggle { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin: 12px 0 4px; font-size: 13px; }
  .charts-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin: 16px 0; }
  .feld-toggle label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  .feld-toggle .meta { margin: 0; font-size: 12px; }
  /* Zeitraum-Presets: native Radios als Segmented Control light — kein JS,
     Custom-Von/Bis gewinnt (dann ist kein Preset aktiv, siehe filterleiste). */
  .feld-zeitraum .presets { display: flex; gap: 10px; align-items: center; min-height: 31px; }
  .feld-zeitraum .presets label { display: inline-flex; align-items: center; gap: 4px; font-weight: 400; font-size: 13px; }
  /* Trend-Zeile der KPI-Kacheln: direkt unter dem Wert (vor Badge/Sub),
     Pfeil + textliches Delta + Referenz-Datum. Nur der Rendite-Pfeil
     urteilt (gut/schlecht) — Preis-Pfeile bleiben Tinte. */
  .tile-trend { display: flex; gap: 6px; align-items: baseline; font-size: 12px; color: var(--text-secondary); margin: 0 0 6px; }
  .trend-pfeil { font-weight: 600; }
  .trend-pfeil-gut { color: var(--good-text); }
  .trend-pfeil-schlecht { color: var(--status-critical); }
  .trend-delta { font-weight: 600; }
  .trend-ref { color: var(--text-secondary); }
`;

/** Ab dieser Abweichung unter dem Serien-Median gilt ein Datenpunkt als Chance (grün). */
const CHANCE_SCHWELLE = -0.2;

/** Zeilen je Seite der Datenpunkt-Tabellen – bewusst klein, ohne Scrollen erfassbar. */
const DATENPUNKTE_PRO_SEITE = 20;

function filterBeschreibung(filter: DashboardFilter): string {
  const teile: string[] = [];
  if (filter.plz) teile.push(`PLZ ${filter.plz}${filter.plz.length < 4 ? '…' : ''}`);
  if (filter.flaecheMin !== undefined || filter.flaecheMax !== undefined) {
    const von = filter.flaecheMin !== undefined ? nfTage.format(filter.flaecheMin) : '';
    const bis = filter.flaecheMax !== undefined ? nfTage.format(filter.flaecheMax) : '';
    teile.push(`${von}–${bis} m²`);
  }
  return teile.join(' · ');
}

function filterleiste(daten: DashboardDaten): string {
  const filter = daten.filter;
  const zuruecksetzen =
    filterBeschreibung(filter) !== '' ||
    filter.ausreisserEinbeziehen === true ||
    filter.zeitraum !== undefined
      ? '\n      <p class="meta"><a href="/">Filter zurücksetzen</a></p>'
      : '';
  const zahlWert = (n: number | undefined): string => (n === undefined ? '' : String(n));
  // Custom-Von/Bis schlägt die Presets: dann ist bewusst KEIN Radio aktiv,
  // damit sichtbar bleibt, dass die Datumsfelder gewinnen.
  const customAktiv = filter.zeitraum?.von !== undefined && filter.zeitraum?.bis !== undefined;
  const aktivesPreset = customAktiv ? undefined : (filter.zeitraum?.preset ?? 'alle');
  const preset = (wert: string, label: string): string =>
    `<label><input type="radio" name="zeitraum" value="${wert}"${aktivesPreset === wert ? ' checked' : ''}> ${label}</label>`;
  // Offene Datenpunkte-Sektion überlebt den Filterwechsel; fällt der Stichtag
  // aus dem neuen Trend, greift der stille Fallback im Handler.
  const stichtagFeld =
    daten.datenpunkteOffen && daten.datenpunkteStichtag !== undefined
      ? `\n      <input type="hidden" name="stichtag" value="${escapeHtml(daten.datenpunkteStichtag)}">`
      : '';
  // Der Drawer-Schalter überlebt den Filterwechsel — er gehört zur
  // Datenpunkte-Sektion, nicht zu dieser Leiste.
  const drawerFeld =
    filter.objekteAusreisserEinbeziehen === true
      ? `\n      <input type="hidden" name="objekte_ausreisser" value="an">`
      : '';
  return `    <form class="filterleiste" method="get" action="/">${stichtagFeld}${drawerFeld}
      <div class="feld feld-plz">
        <label for="f-plz">PLZ (Anfang genügt)</label>
        <input type="text" id="f-plz" name="plz" inputmode="numeric" value="${escapeHtml(filter.plz ?? '')}" placeholder="z. B. 9020 oder 95">
      </div>
      <fieldset class="feld">
        <legend>Fläche (m²)</legend>
        <div class="von-bis">
          <input type="text" id="f-flaeche-min" name="flaeche_min" inputmode="numeric" value="${escapeHtml(zahlWert(filter.flaecheMin))}" placeholder="von" aria-label="Fläche von (m²)">
          <input type="text" id="f-flaeche-max" name="flaeche_max" inputmode="numeric" value="${escapeHtml(zahlWert(filter.flaecheMax))}" placeholder="bis" aria-label="Fläche bis (m²)">
        </div>
      </fieldset>
      <fieldset class="feld feld-zeitraum">
        <legend>Zeitraum</legend>
        <div class="presets">
          ${preset('7d', '7 Tage')}
          ${preset('30d', '30 Tage')}
          ${preset('90d', '90 Tage')}
          ${preset('alle', 'Alle')}
        </div>
      </fieldset>
      <fieldset class="feld">
        <legend>Eigener Zeitraum</legend>
        <div class="von-bis">
          <input type="date" id="f-von" name="von" value="${escapeHtml(filter.zeitraum?.von ?? '')}" aria-label="Von (Datum)">
          <input type="date" id="f-bis" name="bis" value="${escapeHtml(filter.zeitraum?.bis ?? '')}" aria-label="Bis (Datum)">
        </div>
      </fieldset>
      <div class="feld feld-toggle">
        <label><input type="checkbox" name="ausreisser" value="an"${filter.ausreisserEinbeziehen === true ? ' checked' : ''}> Ausreißer einbeziehen</label>
        <p class="meta"><a href="/methodik#ausreisser">Was zählt als Ausreißer?</a></p>
      </div>
      <button class="klein" type="submit">Filtern</button>${zuruecksetzen}
    </form>`;
}

/**
 * Trend-Zeile einer KPI-Kachel: Pfeil + Delta vs. Anfang des gewählten
 * Zeitraums, mit Referenz-Datum (Prinzip 4: der Vergleich bleibt transparent).
 * einheit wählt den Delta-Wert: Rendite vergleicht in %-Punkten (absolut),
 * Preise relativ. urteil färbt nur den Rendite-Pfeil — ein teurerer Markt
 * ist kein Verdikt, eine bessere Rendite schon.
 */
function kachelTrend(
  delta: KpiDelta | null,
  einheit: 'prozent' | 'prozentpunkte',
  urteil: boolean,
): string {
  const wert = einheit === 'prozentpunkte' ? delta?.deltaAbsolut : delta?.deltaAnteil;
  if (delta === null || delta.referenzDatum === null || wert === undefined) {
    return `<div class="tile-trend meta">zu wenig Daten für Trend</div>`;
  }
  const stabil = Math.abs(wert) < DELTA_STABIL_SCHWELLE;
  const pfeil = stabil ? '→' : wert > 0 ? '↑' : '↓';
  const label = stabil ? 'stabil' : wert > 0 ? 'steigend' : 'fallend';
  const klasse = urteil && !stabil ? (wert > 0 ? ' trend-pfeil-gut' : ' trend-pfeil-schlecht') : '';
  return `<div class="tile-trend"><span class="trend-pfeil${klasse}" aria-label="${label}">${pfeil}</span> <span class="trend-delta">${fmtDelta(wert, einheit)}</span> <span class="trend-ref">vs. ${escapeHtml(datumMedium(delta.referenzDatum))}</span></div>`;
}

/**
 * "Stand DD.MM.YYYY" für die tile-sub, wenn der angezeigte Wert nicht vom
 * Seiten-Stichtag stammt (Zeitraum endet vor dem letzten Sweep) — sonst
 * liest sich "N Objekte" als heutiger Marktstand (Prinzip 4).
 */
function standZusatz(datum: string | undefined, seitenStichtag: string): string {
  return datum !== undefined && datum !== seitenStichtag
    ? `Stand ${escapeHtml(datumMedium(datum))}`
    : '';
}

function renditeKachel(daten: DashboardDaten, zielProzent: string): string {
  const letzter = daten.renditeTrend.at(-1);
  const rendite = letzter?.bruttoRendite ?? null;
  if (rendite === null) {
    return `      <div class="tile">
        <div class="tile-label">Bruttorendite</div>
        <div class="tile-value">–</div>
        <div class="tile-sub">braucht Kauf- und Miet-Objekte im gewählten Filter und Zeitraum</div>
      </div>`;
  }
  const erreicht = rendite >= daten.zielRendite;
  const stand = standZusatz(letzter?.datum, daten.stichtag);
  return `      <div class="tile${erreicht ? ' tile-good' : ''}">
        <div class="tile-label">Bruttorendite</div>
        <div class="tile-value">${nfProzent2.format(rendite * 100)}<span class="tile-einheit">%</span></div>
        ${kachelTrend(berechneRenditeKpiDelta(daten.renditeTrend), 'prozentpunkte', true)}
        <div class="tile-badge${erreicht ? ' tile-badge-good' : ''}">${erreicht ? `Ziel ≥ ${zielProzent} erreicht` : `unter Ziel (≥ ${zielProzent})`}</div>${
          stand ? `\n        <div class="tile-sub">${stand}</div>` : ''
        }
      </div>`;
}

function kpiZeile(daten: DashboardDaten, zielProzent: string): string {
  const letzter = daten.trend.at(-1);
  const kauf = letzter?.medianKaufEurM2;
  const miete = letzter?.medianMieteEurM2;
  const stand = standZusatz(letzter?.datum, daten.stichtag);
  const standSuffix = stand ? ` · ${stand}` : '';
  const ausfallWarnung =
    daten.portalAusfaelle.length > 0
      ? `\n    <p class="warnung">Beim letzten Sweep waren ${daten.portalAusfaelle.length} Segment(e) nicht abfragbar – die aktuellen Zahlen sind unvollständig. <a href="/crawl">Details</a></p>`
      : '';
  // Eine leise Zeile unterm Grid statt Datenbasis-Details: Roh-Zählungen und
  // Sweep-Status leben auf /crawl (Navbar-Chip zeigt Laufendes live) — hier
  // zählt nur, wie gerechnet wird, und wo alles erklärt ist.
  const provenienz = `${
    daten.filter.ausreisserEinbeziehen === true ? 'Ausreißer einbezogen' : 'Ohne Ausreißer gerechnet'
  } · Alle Kennzahlen erklärt → <a href="/methodik">Methodik</a>`;
  return `    <div class="kpi-block">
    <div class="tiles">
${renditeKachel(daten, zielProzent)}      <div class="tile">
        <div class="tile-label">Kaufpreis (Median)</div>
        <div class="tile-value">${kauf != null ? `${nfEur0.format(kauf)}<span class="tile-einheit">€/m²</span>` : '–'}</div>
        ${kauf != null ? kachelTrend(berechneKpiDelta(daten.trend, 'medianKaufEurM2'), 'prozent', false) : ''}
        <div class="tile-sub">${letzter ? `${nfTage.format(letzter.anzahlKauf)} Objekte${standSuffix}` : 'keine Daten'}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Kaltmiete (Median)</div>
        <div class="tile-value">${miete != null ? `${nfEur2.format(miete)}<span class="tile-einheit">€/m²</span>` : '–'}</div>
        ${miete != null ? kachelTrend(berechneKpiDelta(daten.trend, 'medianMieteEurM2'), 'prozent', false) : ''}
        <div class="tile-sub">${letzter ? `${nfTage.format(letzter.anzahlMiete)} Objekte${standSuffix}` : 'keine Daten'}</div>
      </div>
    </div>${ausfallWarnung}
    <p class="meta">${provenienz}</p>
    </div>`;
}

function chartSektion(trend: TrendPunkt[]): string {
  if (trend.length === 0) {
    return `    <p class="meta">Keine Objekte im gewählten Filter oder Zeitraum – Filter lockern oder
    <a href="/">zurücksetzen</a>.</p>`;
  }
  return `    <div class="charts-3">
      <div class="chart-box">
        <div class="chart-title">Bruttorendite (%)</div>
        <div class="chart-wrap"><canvas id="trend-rendite" role="img" aria-label="Liniendiagramm: Brutto-Mietrendite in Prozent über die Zeit."></canvas></div>
      </div>
      <div class="chart-box">
        <div class="chart-title">Kauf (€/m²)</div>
        <div class="chart-wrap"><canvas id="trend-kauf" role="img" aria-label="Liniendiagramm: Median-Kaufpreis in Euro pro Quadratmeter über die Zeit."></canvas></div>
      </div>
      <div class="chart-box">
        <div class="chart-title">Miete kalt (€/m²)</div>
        <div class="chart-wrap"><canvas id="trend-miete" role="img" aria-label="Liniendiagramm: Median-Kaltmiete in Euro pro Quadratmeter über die Zeit."></canvas></div>
      </div>
    </div>`;
}

/**
 * Dashboard-URL mit Filter + Stichtag; Sprungziel ist die Datenpunkte-Sektion
 * (bzw. per anker eine der Tabellen). Ohne seiten starten die Tabellen auf
 * Seite 1 (Stichtag-Wechsel setzt die Pagination bewusst zurück).
 */
function dashboardParams(
  filter: DashboardFilter,
  stichtag: string,
  seiten?: { kauf: number; miete: number },
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.plz) params.set('plz', filter.plz);
  if (filter.flaecheMin !== undefined) params.set('flaeche_min', String(filter.flaecheMin));
  if (filter.flaecheMax !== undefined) params.set('flaeche_max', String(filter.flaecheMax));
  if (filter.ausreisserEinbeziehen === true) params.set('ausreisser', 'an');
  if (filter.objekteAusreisserEinbeziehen === true) params.set('objekte_ausreisser', 'an');
  if (filter.zeitraum?.von !== undefined && filter.zeitraum.bis !== undefined) {
    params.set('von', filter.zeitraum.von);
    params.set('bis', filter.zeitraum.bis);
  } else if (filter.zeitraum?.preset !== undefined) {
    params.set('zeitraum', filter.zeitraum.preset);
  }
  params.set('stichtag', stichtag);
  if (seiten !== undefined && seiten.kauf > 1) params.set('kauf_seite', String(seiten.kauf));
  if (seiten !== undefined && seiten.miete > 1) params.set('miete_seite', String(seiten.miete));
  return params;
}

function dashboardUrl(
  filter: DashboardFilter,
  stichtag: string,
  seiten?: { kauf: number; miete: number },
  anker = 'datenpunkte',
): string {
  return `/?${dashboardParams(filter, stichtag, seiten).toString()}#${anker}`;
}

function stichtagNav(daten: DashboardDaten, stichtag: string): string {
  const stichtage = daten.trend.map((t) => t.datum);
  const idx = stichtage.indexOf(stichtag);
  const aeltere =
    idx > 0
      ? `<a href="${dashboardUrl(daten.filter, stichtage[idx - 1] as string)}">← älterer Stichtag</a>`
      : '<span></span>';
  const neuere =
    idx >= 0 && idx < stichtage.length - 1
      ? `<a href="${dashboardUrl(daten.filter, stichtage[idx + 1] as string)}">neuerer Stichtag →</a>`
      : '<span></span>';
  return `      <nav class="seiten-nav" aria-label="Stichtag wählen">
        ${aeltere}
        <span class="meta zaehler">Stichtag ${nfEur0.format(idx + 1)} von ${nfEur0.format(stichtage.length)}</span>
        ${neuere}
      </nav>`;
}

function datenpunktZeile(p: StichtagDatenpunkt, serienMedian: number, kauf: boolean): string {
  const titel = `${p.ort} · ${nfEur0.format(p.zimmer)} Zi.`;
  const link = p.url ? `<a href="${escapeHtml(p.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
  const dedup =
    p.anzahlInserate > 1 ? ` · ${nfEur0.format(p.anzahlInserate)} Inserate (dedupliziert)` : '';
  const sub = `${escapeHtml(p.plz)} · ${escapeHtml(p.portal)}${dedup}`;
  const badge = ausreisserBadge(p);
  // Käufer-Perspektive: deutlich unter dem Median = Chance (grün). Kein Rot
  // für "teuer" – teuer ist kein Verdikt, nur eine Lage. Ausreißer bekommen
  // kein Chance-Grün: erst prüfen (Tippfehler? Sonderfall?), dann freuen.
  const abweichung = p.eurM2 / serienMedian - 1;
  const zeichen = abweichung < 0 ? '−' : '+';
  const abwText = `${zeichen}${nfPct.format(Math.abs(abweichung) * 100)} %`;
  const abwZelle =
    abweichung <= CHANCE_SCHWELLE && !p.istAusreisser
      ? `<span class="gesenkt">${abwText}</span>`
      : abwText;
  return `        <tr${p.istAusreisser ? ' class="row-outlier"' : ''}>
          <td>${link}${badge}<span class="sub">${sub}</span></td>
          <td class="num" data-label="Preis">${nfEur0.format(p.preis)} €</td>
          <td class="num" data-label="Fläche">${nfEur0.format(p.flaecheM2)} m²</td>
          <td class="num" data-label="€/m²">${kauf ? nfEur0.format(p.eurM2) : nfEur2.format(p.eurM2)}</td>
          <td class="num" data-label="Δ Median">${abwZelle}</td>
        </tr>`;
}

function serieBlock(daten: DashboardDaten, stichtag: string, kauf: boolean): string {
  const alle = kauf ? daten.datenpunkte.kauf : daten.datenpunkte.miete;
  const label = kauf ? 'Kauf' : 'Miete';
  const anker = kauf ? 'dp-kauf' : 'dp-miete';
  if (alle.length === 0) {
    return `      <h3 id="${anker}">${label}</h3>
      <p class="meta">Keine aktiven ${label}-Objekte an diesem Stichtag.</p>`;
  }
  // Der Drawer-eigene Schalter (objekte_ausreisser), NICHT der globale
  // Kennzahlen-Toggle, entscheidet, ob Ausreißer überhaupt in Tabelle und
  // Wolke erscheinen: aus (Default) blendet beide Klassen (Hard-Regel und
  // 1,5×IQR) ganz aus, an zeigt sie markiert. Der Serien-Median folgt der
  // sichtbaren Menge.
  const einbeziehen = daten.filter.objekteAusreisserEinbeziehen === true;
  const anzahlAusreisser = alle.filter((p) => p.istAusreisser).length;
  const punkte = einbeziehen ? alle : alle.filter((p) => !p.istAusreisser);
  if (punkte.length === 0) {
    // Alle Objekte sind (hart) geflaggt: bei ausgeblendeten Ausreißern bleibt
    // nichts übrig. Kein 500er — der Schalter macht sie wieder sichtbar.
    return `      <h3 id="${anker}">${label} · ${nfEur0.format(alle.length)} Objekte · alle Ausreißer</h3>
      <p class="meta">Alle ${nfEur0.format(alle.length)} ${label}-Objekte sind Ausreißer und
      ausgeblendet. Mit „Ausreißer einbeziehen" oben einblenden.</p>`;
  }
  const serienMedian = median(punkte.map((p) => p.eurM2));
  const gesamtSeiten = Math.max(1, Math.ceil(punkte.length / DATENPUNKTE_PRO_SEITE));
  const gewuenscht = kauf ? daten.datenpunkteSeiten.kauf : daten.datenpunkteSeiten.miete;
  const seite = Math.min(Math.max(1, gewuenscht), gesamtSeiten);
  const sichtbar = punkte.slice((seite - 1) * DATENPUNKTE_PRO_SEITE, seite * DATENPUNKTE_PRO_SEITE);
  const zeilen = sichtbar.map((p) => datenpunktZeile(p, serienMedian, kauf)).join('\n');
  const url = (zielSeite: number): string =>
    dashboardUrl(
      daten.filter,
      stichtag,
      kauf
        ? { kauf: zielSeite, miete: daten.datenpunkteSeiten.miete }
        : { kauf: daten.datenpunkteSeiten.kauf, miete: zielSeite },
      anker,
    );
  const nav =
    gesamtSeiten > 1
      ? `
      <nav class="seiten-nav" aria-label="${label}-Datenpunkte: Seiten">
        ${seite > 1 ? `<a href="${url(seite - 1)}">← Zurück</a>` : '<span></span>'}
        <span class="meta zaehler">Seite ${nfEur0.format(seite)} von ${nfEur0.format(gesamtSeiten)}</span>
        ${seite < gesamtSeiten ? `<a href="${url(seite + 1)}">Weiter →</a>` : '<span></span>'}
      </nav>`
      : '';
  const ausreisserText =
    anzahlAusreisser > 0
      ? einbeziehen
        ? ` · davon ${nfEur0.format(anzahlAusreisser)} Ausreißer`
        : ` · ${nfEur0.format(anzahlAusreisser)} Ausreißer ausgeblendet`
      : '';
  const medianTeil = ` · Median ${kauf ? nfEur0.format(serienMedian) : nfEur2.format(serienMedian)} €/m²${einbeziehen ? '' : ' (ohne Ausreißer)'}`;
  return `      <h3 id="${anker}">${label} · ${nfEur0.format(punkte.length)} Objekte${ausreisserText}${medianTeil}</h3>
      <div class="tabelle-scroll">
      <table class="tabelle-karten">
        <thead><tr><th scope="col">Objekt</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th><th scope="col" class="num">Δ Median</th></tr></thead>
        <tbody>
${zeilen}
        </tbody>
      </table>
      </div>${nav}`;
}

/**
 * Der Drawer-eigene Ausreißer-Schalter: ein GET-Formular, das alle aktiven
 * Parameter (Filter, Stichtag, Tabellen-Seiten) als Hidden-Felder mitführt —
 * der Drawer bleibt beim Absenden offen (stichtag gesetzt) und die Seite
 * springt per Anker zurück zur Sektion. Nur objekte_ausreisser kommt aus
 * der Checkbox selbst.
 */
function drawerToggleForm(daten: DashboardDaten, stichtag: string): string {
  const params = dashboardParams(daten.filter, stichtag, daten.datenpunkteSeiten);
  params.delete('objekte_ausreisser');
  const hidden = [...params.entries()]
    .map(
      ([name, wert]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(wert)}">`,
    )
    .join('\n        ');
  const checked = daten.filter.objekteAusreisserEinbeziehen === true ? ' checked' : '';
  return `      <form class="drawer-toggle feld-toggle" method="get" action="/#datenpunkte">
        ${hidden}
        <label><input type="checkbox" name="objekte_ausreisser" value="an"${checked}> Ausreißer einbeziehen</label>
        <button class="klein" type="submit">Anwenden</button>
        <p class="meta">Gilt nur für diese Ansicht: blendet die Ausreißer in
        Tabelle und Punktwolke ein bzw. aus und rechnet sie entsprechend in den
        Serien-Median — die Kennzahlen oben steuert der Schalter in der
        Filterleiste.</p>
      </form>`;
}

function datenpunkteSektion(daten: DashboardDaten): string {
  const stichtag = daten.datenpunkteStichtag;
  if (daten.trend.length === 0 || stichtag === undefined) return '';
  return `
  <section id="datenpunkte">
    <details class="datenpunkte"${daten.datenpunkteOffen ? ' open' : ''}>
      <summary><h2>Die Objekte hinter den Zahlen (Stichtag ${escapeHtml(datumMedium(stichtag))})</h2></summary>
      <p class="meta">Jeder Punkt ein Objekt: die einzelnen €/m²-Werte hinter den
      Stichtag-Medianen, dazu die Median-Linie. Wolke, Tabelle und Median-Linie
      folgen alle dem Ausreißer-Schalter dieser Sektion: aus (Default) blendet
      die Ausreißer aus, an zeigt sie wieder — in der Tabelle markiert.
      <a href="/methodik#objekte">Details</a></p>
      <div class="charts-2">
        <div class="chart-box">
          <div class="chart-title">Kauf (€/m²) · Punktwolke &amp; Median · log. Skala</div>
          <div class="chart-wrap"><canvas id="streu-kauf" role="img" aria-label="Streudiagramm: Kaufpreis in Euro pro Quadratmeter je Objekt und Stichtag, mit Median-Linie, logarithmische Skala."></canvas></div>
        </div>
        <div class="chart-box">
          <div class="chart-title">Miete kalt (€/m²) · Punktwolke &amp; Median · log. Skala</div>
          <div class="chart-wrap"><canvas id="streu-miete" role="img" aria-label="Streudiagramm: Kaltmiete in Euro pro Quadratmeter je Objekt und Stichtag, mit Median-Linie, logarithmische Skala."></canvas></div>
        </div>
      </div>
      <p class="meta">Die Tabellen zeigen die Objekte des gewählten Stichtags.
      Ausreißer (Plausibilitätsregeln und 1,5×IQR) sind standardmäßig ausgeblendet;
      der Schalter unten blendet sie markiert wieder ein und rechnet sie in den
      Serien-Median. <a href="/methodik#ausreisser">Details</a></p>
${drawerToggleForm(daten, stichtag)}
${stichtagNav(daten, stichtag)}
${serieBlock(daten, stichtag, true)}
${serieBlock(daten, stichtag, false)}
    </details>
  </section>
`;
}

/** Startseite ohne Daten: noch kein fertiger Sweep. */
export function renderDashboardOhneDatenSeite(sweepLaeuft: boolean): string {
  // Selbe Meta-Zeile wie im befüllten Zustand (ohne "Stand …").
  return renderOhneDatenSeite({
    titel: 'Dashboard',
    aktiv: 'dashboard',
    ueberschrift: 'Wohnungsmarkt Kärnten',
    untertitel: 'willhaben.at &amp; immoscout24.at · täglich gecrawlt',
    sweepLaeuft,
  });
}

export function renderDashboardSeite(daten: DashboardDaten): string {
  const zielProzent = `${(daten.zielRendite * 100).toLocaleString('de-AT')} %`;
  const beschreibung = filterBeschreibung(daten.filter);
  // label = dd.mm.yyyy für Achsen und Tooltips; datum (ISO) bleibt für die Nav-Links.
  const trendJson = JSON.stringify(
    daten.trend.map((t) => ({ ...t, label: datumMedium(t.datum) })),
  ).replace(/</g, '\\u003c'); // "</script>"-sicher
  const renditeJson = JSON.stringify(daten.renditeTrend).replace(/</g, '\\u003c');
  // Median-Serie der Wolken-Linie: folgt dem Drawer-Schalter, nicht dem
  // globalen Toggle. Nur die zwei Median-Felder — Stichtage/Labels kommen
  // positionsgleich aus TREND. Stehen beide Schalter gleich, reicht der
  // Server dasselbe Array durch — dann alias statt Byte-Kopie (der Payload
  // wächst sonst mit jedem Sweep-Tag doppelt).
  const dpTrendJson =
    daten.datenpunkteTrend === daten.trend
      ? 'TREND'
      : JSON.stringify(
          daten.datenpunkteTrend.map((t) => ({
            medianKaufEurM2: t.medianKaufEurM2,
            medianMieteEurM2: t.medianMieteEurM2,
          })),
        ).replace(/</g, '\\u003c');
  // Gerundet serialisieren: bei tausenden Punkten spart das spürbar HTML-Gewicht,
  // und feiner als ganze € (Kauf) bzw. Cent (Miete) zeichnet kein Pixel.
  const streuungJson = JSON.stringify(
    daten.streuung.map((s) => ({
      datum: s.datum,
      kauf: s.kauf.map((v) => Math.round(v)),
      miete: s.miete.map((v) => Math.round(v * 100) / 100),
    })),
  ).replace(/</g, '\\u003c');

  // Filter zusammengeklappt, solange keiner aktiv ist: die Seite beginnt mit
  // den Zahlen, nicht mit Formular-Feldern. Ein aktiver Filter öffnet die
  // Leiste und benennt sich in der Summary — geteilte URLs erklären sich.
  const filterAktiv =
    beschreibung !== '' ||
    daten.filter.ausreisserEinbeziehen === true ||
    daten.filter.zeitraum !== undefined;
  const filterLabel = beschreibung ? `Gefiltert: ${escapeHtml(beschreibung)}` : 'Filtern';
  const inhalt = `  <header>
    <h1>Wohnungsmarkt Kärnten</h1>
    <p class="meta">willhaben.at &amp; immoscout24.at · täglich gecrawlt · Stand ${escapeHtml(datumMedium(daten.stichtag))}</p>
  </header>

  <section class="filter-sektion">
    <details class="filter"${filterAktiv ? ' open' : ''}>
      <summary>${filterLabel}</summary>
${filterleiste(daten)}
    </details>
  </section>

${kpiZeile(daten, zielProzent)}

  <section class="verlauf">
    <h2>Preisentwicklung über die Zeit</h2>
    <p class="meta">Ein Punkt je Crawl-Lauf: Median der aktiven Objekte (${
      daten.filter.ausreisserEinbeziehen === true
        ? 'Ausreißer einbezogen'
        : 'ohne Ausreißer'
    }). <a href="/methodik#objekte">Details</a></p>
${chartSektion(daten.trend)}
  </section>
${datenpunkteSektion(daten)}
  <footer>
    <p>Objekte über beide Portale dedupliziert (<a href="/methodik#objekte">Matching-Regeln</a>);
      Delisting bleibt ein Näherungswert für verkauft/vermietet ·
      Rohdaten: <a href="/inserate">alle Inserate</a></p>
  </footer>

  <script>const TREND = ${trendJson}; const RENDITE = ${renditeJson}; const STREUUNG = ${streuungJson}; const DP_TREND = ${dpTrendJson};</script>
<script src="${CHART_JS_CDN}"></script>
<script>
(function () {
  'use strict';
  if (TREND.length === 0) return; // Empty-State steht im Markup, keine Charts nötig
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.chart-wrap').forEach((el) => {
      el.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">Diagramm nicht verfügbar '
        + '(Chart.js-CDN nicht erreichbar – Internetverbindung nötig).</p>';
    });
    return;
  }
  const nfEur = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
  const nfEur2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfPct = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const reduziert = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let charts = [];
  let ersterZeichnung = true;

  function linie(canvasId, werte, farbeVar, format, tooltip) {
    return new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: {
        labels: TREND.map((t) => t.label),
        datasets: [{
          data: werte,
          borderColor: cssVar(farbeVar),
          backgroundColor: cssVar(farbeVar),
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.15,
          spanGaps: false, // Lücken (keine Daten) sichtbar lassen
        }],
      },
      options: {
        animation: reduziert || !ersterZeichnung ? false : { duration: 300, easing: 'easeOutQuart' },
        maintainAspectRatio: false,
        // Spalten-Hover statt Punkt-Treffer: der Tooltip erscheint schon beim
        // Überfahren des Stichtags – auf dünnen Linien deutlich gutmütiger.
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false }, // eine Serie: Panel-Titel benennt sie
          tooltip: { callbacks: { label: tooltip } },
        },
        scales: {
          x: { grid: { display: false }, border: { color: cssVar('--baseline') },
               ticks: { color: cssVar('--text-secondary'), font: { family: FONT },
                        maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: cssVar('--grid') }, border: { display: false },
               ticks: { color: cssVar('--text-muted'), font: { family: FONT },
                        callback: (v) => format(v) } },
        },
      },
    });
  }

  function renderAll() {
    charts.forEach((c) => c.destroy());
    charts = [
      linie('trend-rendite', RENDITE.map((r) => r.bruttoRendite === null ? null : r.bruttoRendite * 100),
        '--series-3', (v) => nfPct.format(v) + ' %',
        (c) => nfPct.format(c.parsed.y) + ' % (' + TREND[c.dataIndex].anzahlKauf + ' Kauf / '
          + TREND[c.dataIndex].anzahlMiete + ' Miete)'),
      linie('trend-kauf', TREND.map((t) => t.medianKaufEurM2),
        '--series-kauf', (v) => nfEur.format(Math.round(v)),
        (c) => nfEur.format(Math.round(c.parsed.y)) + ' €/m² (' + TREND[c.dataIndex].anzahlKauf + ' Objekte)'),
      linie('trend-miete', TREND.map((t) => t.medianMieteEurM2),
        '--series-miete', (v) => nfEur2.format(v),
        (c) => nfEur2.format(c.parsed.y) + ' €/m² (' + TREND[c.dataIndex].anzahlMiete + ' Objekte)'),
    ];
    ersterZeichnung = false;
  }

  renderAll();

  // --- Punktwolke der Datenpunkte-Sektion ---
  // Erst beim Aufklappen zeichnen: ein Canvas in zugeklapptem <details> hat
  // keine Größe, und zugeklappt kostet die Wolke sonst nur Ladezeit.
  const details = document.querySelector('#datenpunkte details');
  let streuCharts = [];
  let streuGezeichnet = false;

  function streuChart(canvasId, serie, medianVon, format) {
    const wolke = [];
    STREUUNG.forEach((s, i) => {
      s[serie].forEach((wert, j) => {
        // Deterministischer Jitter entzerrt die Stichtag-Spalten, ohne bei
        // jedem Re-Render (Theme-Wechsel) zu springen.
        const versatz = (((i * 7919 + j * 104729) % 1000) / 1000 - 0.5) * 0.5;
        wolke.push({ x: i + versatz, y: wert });
      });
    });
    const farbe = cssVar(serie === 'kauf' ? '--series-kauf' : '--series-miete');
    return new Chart(document.getElementById(canvasId), {
      data: {
        datasets: [
          {
            type: 'scatter',
            data: wolke,
            backgroundColor: farbe + '4d', // ~30 % Alpha gegen Overplotting
            borderColor: 'transparent',
            pointRadius: 2,
            pointHoverRadius: 5,
            order: 2, // höhere Order = weiter hinten – die Wolke liegt unter dem Median
          },
          {
            type: 'line',
            // Median-Serie aus DP_TREND: folgt dem Drawer-Schalter der
            // Sektion, nicht dem globalen Kennzahlen-Toggle.
            data: DP_TREND.map((t, i) => ({ x: i, y: medianVon(t) })),
            borderColor: farbe,
            backgroundColor: farbe,
            borderWidth: 2,
            // Surface-Ring hebt die Median-Punkte aus der Wolke heraus.
            pointBorderColor: cssVar('--surface-1'),
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.15,
            spanGaps: false,
            order: 1,
          },
        ],
      },
      options: {
        animation: false, // tausende Punkte – Einblendung ruckelt nur
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, // Panel-Titel benennt Wolke & Median
          tooltip: {
            callbacks: {
              label: (c) => {
                const punkt = TREND[Math.round(c.parsed.x)];
                const datum = punkt ? punkt.label : '';
                return (c.datasetIndex === 1 ? 'Median ' : '')
                  + format(c.parsed.y) + ' €/m² (' + datum + ')';
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: -0.5,
            max: TREND.length - 0.5,
            grid: { display: false },
            border: { color: cssVar('--baseline') },
            // Ticks exakt auf die Stichtag-Spalten legen – die automatische
            // Einteilung trifft sonst halbe Positionen und lässt die Achse leer.
            afterBuildTicks: (achse) => {
              achse.ticks = TREND.map((_, i) => ({ value: i }));
            },
            ticks: {
              color: cssVar('--text-secondary'),
              font: { family: FONT },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
              callback: (v) => (TREND[v] ? TREND[v].label : ''),
            },
          },
          y: {
            // Logarithmisch: €/m² ist stark rechtsschief – einzelne Ausreißer
            // würden den dichten Marktbereich sonst an die Nulllinie stauchen.
            type: 'logarithmic',
            grid: { color: cssVar('--grid') },
            border: { display: false },
            ticks: { color: cssVar('--text-muted'), font: { family: FONT },
                     maxTicksLimit: 9, callback: (v) => format(v) },
          },
        },
      },
    });
  }

  function zeichneStreuung() {
    streuCharts.forEach((c) => c.destroy());
    streuCharts = [
      streuChart('streu-kauf', 'kauf', (t) => t.medianKaufEurM2, (v) => nfEur.format(Math.round(v))),
      streuChart('streu-miete', 'miete', (t) => t.medianMieteEurM2, (v) => nfEur2.format(v)),
    ];
    streuGezeichnet = true;
  }

  if (details) {
    if (details.open) zeichneStreuung();
    details.addEventListener('toggle', () => {
      if (details.open && !streuGezeichnet) zeichneStreuung();
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    renderAll();
    if (streuGezeichnet) zeichneStreuung();
  });
})();
</script>`;

  return seite('Dashboard', inhalt, {
    breite: 'breit',
    aktiv: 'dashboard',
    extraCss: DASHBOARD_CSS,
  });
}
