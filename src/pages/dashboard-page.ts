import type { DashboardFilter } from '../search.js';
import { median } from '../stats.js';
import type {
  RenditeTrendPunkt,
  StichtagDatenpunkt,
  StreuungsPunkt,
  TrendPunkt,
} from '../trend.js';
import { fmtRendite, datumMedium, nfEur0, nfEur2, nfPct, nfTage } from './format.js';
import { escapeHtml, seite } from './layout.js';

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
  sweepBeendetAm: Date;
  /** Quellen-Zeilen fehlgeschlagener Segmente des Stichtag-Sweeps. */
  portalAusfaelle: string[];
  sweepLaeuft: boolean;
  trend: TrendPunkt[];
  renditeTrend: RenditeTrendPunkt[];
  filter: DashboardFilter;
  /** Ziel-Bruttorendite (Anteil), ab der die Kachel als "gut" gilt. */
  zielRendite: number;
  /** Datenpunkte der Datenpunkte-Sektion (Objekte hinter dem Wochen-Median). */
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
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px; }
  .tile { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .tile-good { background: var(--good-bg); }
  .tile-label { color: var(--text-secondary); font-size: 13px; }
  .tile-value { font-size: 30px; font-weight: 600; margin: 2px 0 6px; }
  .tile-badge { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
  .tile-badge-good { color: var(--good-text); font-weight: 600; }
  .tile-sub { font-size: 12px; color: var(--text-secondary); }
  .charts-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
  .chart-box { min-width: 0; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  .warnung { color: var(--status-critical); font-size: 13px; }
  .datenpunkte summary { cursor: pointer; }
  .datenpunkte summary h2 { display: inline; margin: 0; }
  .datenpunkte h3 { font-size: 13px; font-weight: 600; margin: 20px 0 8px; }
  .charts-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin: 16px 0; }
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
    filterBeschreibung(filter) !== ''
      ? '\n      <p class="meta"><a href="/">Filter zurücksetzen</a></p>'
      : '';
  const zahlWert = (n: number | undefined): string => (n === undefined ? '' : String(n));
  // Offene Datenpunkte-Sektion überlebt den Filterwechsel; fällt der Stichtag
  // aus dem neuen Trend, greift der stille Fallback im Handler.
  const stichtagFeld =
    daten.datenpunkteOffen && daten.datenpunkteStichtag !== undefined
      ? `\n      <input type="hidden" name="stichtag" value="${escapeHtml(daten.datenpunkteStichtag)}">`
      : '';
  return `    <form class="filterleiste" method="get" action="/">${stichtagFeld}
      <div class="feld">
        <label for="f-plz">PLZ (Präfix)</label>
        <input type="text" id="f-plz" name="plz" inputmode="numeric" value="${escapeHtml(filter.plz ?? '')}" placeholder="z. B. 9020 oder 95">
      </div>
      <div class="feld">
        <label for="f-flaeche-min">Fläche von (m²)</label>
        <input type="text" id="f-flaeche-min" name="flaeche_min" inputmode="numeric" value="${escapeHtml(zahlWert(filter.flaecheMin))}" placeholder="z. B. 45">
      </div>
      <div class="feld">
        <label for="f-flaeche-max">Fläche bis (m²)</label>
        <input type="text" id="f-flaeche-max" name="flaeche_max" inputmode="numeric" value="${escapeHtml(zahlWert(filter.flaecheMax))}" placeholder="z. B. 90">
      </div>
      <button>Filtern</button>${zuruecksetzen}
    </form>`;
}

function renditeKachel(daten: DashboardDaten, zielProzent: string): string {
  const letzter = daten.renditeTrend.at(-1);
  const rendite = letzter?.bruttoRendite ?? null;
  if (rendite === null) {
    return `      <div class="tile">
        <div class="tile-label">Bruttorendite</div>
        <div class="tile-value">–</div>
        <div class="tile-sub">braucht Kauf- und Miet-Objekte im Filter</div>
      </div>`;
  }
  const erreicht = rendite >= daten.zielRendite;
  return `      <div class="tile${erreicht ? ' tile-good' : ''}">
        <div class="tile-label">Bruttorendite</div>
        <div class="tile-value">${fmtRendite(rendite)}</div>
        <div class="tile-badge${erreicht ? ' tile-badge-good' : ''}">${erreicht ? `Ziel ≥ ${zielProzent} erreicht` : `unter Ziel (≥ ${zielProzent})`}</div>
        <div class="tile-sub">Median-Kaltmiete ×12 ÷ Median-Kaufpreis, je €/m²</div>
      </div>`;
}

function kpiZeile(daten: DashboardDaten, zielProzent: string): string {
  const letzter = daten.trend.at(-1);
  const kauf = letzter?.medianKaufEurM2;
  const miete = letzter?.medianMieteEurM2;
  const ausfallWarnung =
    daten.portalAusfaelle.length > 0
      ? `\n    <p class="warnung">Beim letzten Sweep waren ${daten.portalAusfaelle.length} Segment(e) nicht abfragbar – die aktuellen Zahlen sind unvollständig. <a href="/crawl">Details</a></p>`
      : '';
  return `    <div class="tiles">
${renditeKachel(daten, zielProzent)}      <div class="tile">
        <div class="tile-label">Kaufpreis (Median)</div>
        <div class="tile-value">${kauf != null ? `${nfEur0.format(kauf)} €/m²` : '–'}</div>
        <div class="tile-sub">${letzter ? `${nfTage.format(letzter.anzahlKauf)} aktive Kauf-Objekte` : 'keine Daten'}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Kaltmiete (Median)</div>
        <div class="tile-value">${miete != null ? `${nfEur2.format(miete)} €/m²` : '–'}</div>
        <div class="tile-sub">${letzter ? `${nfTage.format(letzter.anzahlMiete)} aktive Miet-Objekte` : 'keine Daten'}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Letzter Sweep</div>
        <div class="tile-value">${escapeHtml(datumMedium(daten.stichtag))}</div>
        <div class="tile-sub">${daten.sweepLaeuft ? 'nächster Sweep läuft gerade — ' : ''}<a href="/crawl">alle Läufe</a></div>
      </div>
    </div>${ausfallWarnung}`;
}

function chartSektion(trend: TrendPunkt[]): string {
  if (trend.length === 0) {
    return `    <p class="meta">Keine Objekte im gewählten Filter – Filter lockern oder
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
 * Seite 1 (Wochen-Wechsel setzt die Pagination bewusst zurück).
 */
function dashboardUrl(
  filter: DashboardFilter,
  stichtag: string,
  seiten?: { kauf: number; miete: number },
  anker = 'datenpunkte',
): string {
  const params = new URLSearchParams();
  if (filter.plz) params.set('plz', filter.plz);
  if (filter.flaecheMin !== undefined) params.set('flaeche_min', String(filter.flaecheMin));
  if (filter.flaecheMax !== undefined) params.set('flaeche_max', String(filter.flaecheMax));
  params.set('stichtag', stichtag);
  if (seiten !== undefined && seiten.kauf > 1) params.set('kauf_seite', String(seiten.kauf));
  if (seiten !== undefined && seiten.miete > 1) params.set('miete_seite', String(seiten.miete));
  return `/?${params.toString()}#${anker}`;
}

function wochenNav(daten: DashboardDaten, stichtag: string): string {
  const stichtage = daten.trend.map((t) => t.datum);
  const idx = stichtage.indexOf(stichtag);
  const aeltere =
    idx > 0
      ? `<a href="${dashboardUrl(daten.filter, stichtage[idx - 1] as string)}">← ältere Woche</a>`
      : '<span></span>';
  const neuere =
    idx >= 0 && idx < stichtage.length - 1
      ? `<a href="${dashboardUrl(daten.filter, stichtage[idx + 1] as string)}">neuere Woche →</a>`
      : '<span></span>';
  return `      <nav class="seiten-nav" aria-label="Stichtag wählen">
        ${aeltere}
        <span class="meta zaehler">Woche ${nfEur0.format(idx + 1)} von ${nfEur0.format(stichtage.length)}</span>
        ${neuere}
      </nav>`;
}

function datenpunktZeile(p: StichtagDatenpunkt, serienMedian: number, kauf: boolean): string {
  const titel = `${p.ort} · ${nfEur0.format(p.zimmer)} Zi.`;
  const link = p.url ? `<a href="${escapeHtml(p.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
  const dedup =
    p.anzahlInserate > 1 ? ` · ${nfEur0.format(p.anzahlInserate)} Inserate (dedupliziert)` : '';
  const sub = `${escapeHtml(p.plz)} · ${escapeHtml(p.portal)}${dedup}`;
  const abweichung = p.eurM2 / serienMedian - 1;
  const zeichen = abweichung < 0 ? '−' : '+';
  const abwText = `${zeichen}${nfPct.format(Math.abs(abweichung) * 100)} %`;
  // Käufer-Perspektive: deutlich unter dem Median = Chance (grün). Kein Rot
  // für "teuer" – teuer ist kein Verdikt, nur eine Lage.
  const abwZelle =
    abweichung <= CHANCE_SCHWELLE ? `<span class="gesenkt">${abwText}</span>` : abwText;
  return `        <tr>
          <td>${link}<span class="sub">${sub}</span></td>
          <td class="num">${nfEur0.format(p.preis)} €</td>
          <td class="num">${nfEur0.format(p.flaecheM2)} m²</td>
          <td class="num">${kauf ? nfEur0.format(p.eurM2) : nfEur2.format(p.eurM2)}</td>
          <td class="num">${abwZelle}</td>
        </tr>`;
}

function serieBlock(daten: DashboardDaten, stichtag: string, kauf: boolean): string {
  const punkte = kauf ? daten.datenpunkte.kauf : daten.datenpunkte.miete;
  const label = kauf ? 'Kauf' : 'Miete';
  const anker = kauf ? 'dp-kauf' : 'dp-miete';
  if (punkte.length === 0) {
    return `      <h3 id="${anker}">${label}</h3>
      <p class="meta">Keine aktiven ${label}-Objekte an diesem Stichtag.</p>`;
  }
  // Median über ALLE Punkte der Serie, nicht über die Tabellen-Seite.
  const serienMedian = median(punkte.map((p) => p.eurM2));
  const medianText = kauf ? nfEur0.format(serienMedian) : nfEur2.format(serienMedian);
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
  return `      <h3 id="${anker}">${label} · ${nfEur0.format(punkte.length)} Objekte · Median ${medianText} €/m²</h3>
      <div class="tabelle-scroll">
      <table>
        <thead><tr><th scope="col">Objekt</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th><th scope="col" class="num">Δ Median</th></tr></thead>
        <tbody>
${zeilen}
        </tbody>
      </table>
      </div>${nav}`;
}

function datenpunkteSektion(daten: DashboardDaten): string {
  const stichtag = daten.datenpunkteStichtag;
  if (daten.trend.length === 0 || stichtag === undefined) return '';
  return `
  <section id="datenpunkte">
    <details class="datenpunkte"${daten.datenpunkteOffen ? ' open' : ''}>
      <summary><h2>Datenpunkte (Stichtag ${escapeHtml(datumMedium(stichtag))})</h2></summary>
      <p class="meta">Jeder Punkt ein Objekt: die einzelnen €/m²-Werte hinter den
      Wochen-Medianen, dazu die Median-Linie aus dem Wochenraster.
      <a href="/methodik#objekte">Details</a></p>
      <div class="charts-2">
        <div class="chart-box">
          <div class="chart-title">Kauf (€/m²) · Punktwolke &amp; Median · log. Skala</div>
          <div class="chart-wrap"><canvas id="streu-kauf" role="img" aria-label="Streudiagramm: Kaufpreis in Euro pro Quadratmeter je Objekt und Woche, mit Median-Linie, logarithmische Skala."></canvas></div>
        </div>
        <div class="chart-box">
          <div class="chart-title">Miete kalt (€/m²) · Punktwolke &amp; Median · log. Skala</div>
          <div class="chart-wrap"><canvas id="streu-miete" role="img" aria-label="Streudiagramm: Kaltmiete in Euro pro Quadratmeter je Objekt und Woche, mit Median-Linie, logarithmische Skala."></canvas></div>
        </div>
      </div>
      <p class="meta">Die Tabellen zeigen die Punkte des gewählten Stichtags – zum
      Nachschlagen und Prüfen einzelner Ausreißer.</p>
${wochenNav(daten, stichtag)}
${serieBlock(daten, stichtag, true)}
${serieBlock(daten, stichtag, false)}
    </details>
  </section>
`;
}

/** Startseite ohne Daten: noch kein fertiger Sweep. */
export function renderDashboardOhneDatenSeite(sweepLaeuft: boolean): string {
  const inhalt = `  <header>
    <h1>Wohnungsmarkt Kärnten</h1>
  </header>
  <section>
    <h2>Noch keine Daten</h2>
    <p class="meta">${
      sweepLaeuft
        ? 'Der erste Kärnten-Sweep läuft gerade – diese Seite füllt sich, sobald er fertig ist.'
        : 'Der erste Kärnten-Sweep steht noch aus; er startet automatisch (spätestens 30 Minuten nach Serverstart).'
    } Fortschritt: <a href="/crawl">Crawl-Läufe</a></p>
  </section>`;
  return seite('Dashboard', inhalt, { aktiv: 'dashboard' });
}

export function renderDashboardSeite(daten: DashboardDaten): string {
  const zielProzent = `${(daten.zielRendite * 100).toLocaleString('de-AT')} %`;
  const beschreibung = filterBeschreibung(daten.filter);
  const trendJson = JSON.stringify(daten.trend).replace(/</g, '\\u003c'); // "</script>"-sicher
  const renditeJson = JSON.stringify(daten.renditeTrend).replace(/</g, '\\u003c');
  // Gerundet serialisieren: bei tausenden Punkten spart das spürbar HTML-Gewicht,
  // und feiner als ganze € (Kauf) bzw. Cent (Miete) zeichnet kein Pixel.
  const streuungJson = JSON.stringify(
    daten.streuung.map((s) => ({
      datum: s.datum,
      kauf: s.kauf.map((v) => Math.round(v)),
      miete: s.miete.map((v) => Math.round(v * 100) / 100),
    })),
  ).replace(/</g, '\\u003c');

  const inhalt = `  <header>
    <h1>Wohnungsmarkt Kärnten${beschreibung ? ` · ${escapeHtml(beschreibung)}` : ''}</h1>
    <p class="meta">Alle Wohnungen (Kauf & Miete) von willhaben.at und immoscout24.at,
    täglich vollständig gecrawlt und zu Objekten dedupliziert · Stand ${escapeHtml(datumMedium(daten.stichtag))}</p>
  </header>

  <section>
${filterleiste(daten)}
  </section>

  <section>
${kpiZeile(daten, zielProzent)}
    <p class="meta" style="margin-bottom: 0;">Alle Kennzahlen erklärt → <a href="/methodik">Methodik</a></p>
  </section>

  <section>
    <h2>Zeitreihen (Wochenraster)</h2>
    <p class="meta">Median über die am Stichtag aktiven Objekte; ein Objekt zählt einmal,
    auch wenn es auf beiden Portalen inseriert ist. <a href="/methodik#objekte">Details</a></p>
${chartSektion(daten.trend)}
  </section>
${datenpunkteSektion(daten)}
  <footer>
    <p><strong>Datenbasis:</strong> dedupliziert nach PLZ/Fläche/Zimmer-Heuristik
      (<a href="/methodik#objekte">Matching-Regeln</a>); Wiedereinstellungen führen die
      Preishistorie fort. Delisting bleibt ein Näherungswert für verkauft/vermietet.</p>
    <p>Stichtag: letzter fertiger Sweep (${escapeHtml(datumMedium(daten.stichtag))}).
      Rohdaten: <a href="/inserate">alle Inserate</a>.</p>
  </footer>

  <script>const TREND = ${trendJson}; const RENDITE = ${renditeJson}; const STREUUNG = ${streuungJson};</script>
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
        labels: TREND.map((t) => t.datum),
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
        // Deterministischer Jitter entzerrt die Wochen-Spalten, ohne bei
        // jedem Re-Render (Theme-Wechsel) zu springen.
        const versatz = (((i * 7919 + j * 104729) % 1000) / 1000 - 0.5) * 0.5;
        wolke.push({ x: i + versatz, y: wert });
      });
    });
    const farbe = cssVar(serie === 'kauf' ? '--series-kauf' : '--series-miete');
    // Achse symmetrisch um den Median (log-Raum): das geometrische Mittel der
    // Wochen-Mediane sitzt in der Chart-Mitte, der Faktor deckt alle Punkte ab.
    const mediane = TREND.map(medianVon).filter((m) => m !== null && m > 0);
    const mitte = mediane.length > 0
      ? Math.exp(mediane.reduce((summe, m) => summe + Math.log(m), 0) / mediane.length)
      : undefined;
    let faktor = 1.5;
    if (mitte !== undefined) {
      for (const p of wolke) {
        if (p.y > 0) faktor = Math.max(faktor, p.y / mitte, mitte / p.y);
      }
      faktor *= 1.15; // etwas Rand über/unter den äußersten Punkten
    }
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
            data: TREND.map((t, i) => ({ x: i, y: medianVon(t) })),
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
                const woche = TREND[Math.round(c.parsed.x)];
                const datum = woche ? woche.datum : '';
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
            ticks: {
              stepSize: 1,
              color: cssVar('--text-secondary'),
              font: { family: FONT },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
              callback: (v) => (Number.isInteger(v) && TREND[v] ? TREND[v].datum : ''),
            },
          },
          y: {
            // Logarithmisch: €/m² ist stark rechtsschief – einzelne Ausreißer
            // würden den dichten Marktbereich sonst an die Nulllinie stauchen.
            type: 'logarithmic',
            ...(mitte !== undefined ? { min: mitte / faktor, max: mitte * faktor } : {}),
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
