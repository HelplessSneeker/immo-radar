import type { DashboardFilter } from '../search.js';
import type { RenditeTrendPunkt, TrendPunkt } from '../trend.js';
import { fmtRendite, datumMedium, nfEur0, nfEur2, nfTage } from './format.js';
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
`;

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

function filterleiste(filter: DashboardFilter): string {
  const zuruecksetzen =
    filterBeschreibung(filter) !== ''
      ? '\n      <p class="meta"><a href="/">Filter zurücksetzen</a></p>'
      : '';
  const zahlWert = (n: number | undefined): string => (n === undefined ? '' : String(n));
  return `    <form class="filterleiste" method="get" action="/">
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

  const inhalt = `  <header>
    <h1>Wohnungsmarkt Kärnten${beschreibung ? ` · ${escapeHtml(beschreibung)}` : ''}</h1>
    <p class="meta">Alle Wohnungen (Kauf & Miete) von willhaben.at und immoscout24.at,
    täglich vollständig gecrawlt und zu Objekten dedupliziert · Stand ${escapeHtml(datumMedium(daten.stichtag))}</p>
  </header>

  <section>
${filterleiste(daten.filter)}
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

  <footer>
    <p><strong>Datenbasis:</strong> dedupliziert nach PLZ/Fläche/Zimmer-Heuristik
      (<a href="/methodik#objekte">Matching-Regeln</a>); Wiedereinstellungen führen die
      Preishistorie fort. Delisting bleibt ein Näherungswert für verkauft/vermietet.</p>
    <p>Stichtag: letzter fertiger Sweep (${escapeHtml(datumMedium(daten.stichtag))}).
      Rohdaten: <a href="/inserate">alle Inserate</a>.</p>
  </footer>

  <script>const TREND = ${trendJson}; const RENDITE = ${renditeJson};</script>
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
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
})();
</script>`;

  return seite('Dashboard', inhalt, {
    breite: 'breit',
    aktiv: 'dashboard',
    extraCss: DASHBOARD_CSS,
  });
}
