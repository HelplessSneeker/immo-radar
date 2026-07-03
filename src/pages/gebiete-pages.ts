import type { CrawlLauf, Gebiet } from '../db/gebiete-repo.js';
import type { PreisReduktion, TrendPunkt, VermarktungsStatistik } from '../trend.js';
import { escapeHtml, seite } from './layout.js';
import { kriterienFelder } from './search-page.js';
import { kriterienZusammenfassung } from './suchen-pages.js';

/** Verwaltungs- und Auswertungsseiten der Beobachtungsgebiete (Watchlist). */

function gebieteTabelle(gebiete: Gebiet[]): string {
  const zeilen = gebiete
    .map((g) => {
      const schalter = g.aktiv
        ? `<form method="post" action="/gebiete/${g.id}/deaktivieren"><button class="klein">deaktivieren</button></form>`
        : `<form method="post" action="/gebiete/${g.id}/aktivieren"><button class="klein">aktivieren</button></form>`;
      const crawlen = `<form method="post" action="/gebiete/${g.id}/aktualisieren"><button class="klein">jetzt crawlen</button></form>`;
      return `      <tr>
        <td><a href="/gebiete/${g.id}">${escapeHtml(g.name)}</a></td>
        <td class="meta">${escapeHtml(kriterienZusammenfassung(g.kriterien))}</td>
        <td><span class="status-badge status-${g.aktiv ? 'aktiv' : 'inaktiv'}">${g.aktiv ? 'aktiv' : 'inaktiv'}</span></td>
        <td><div class="aktionen">${crawlen}${schalter}</div></td>
      </tr>`;
    })
    .join('\n');
  return `    <table class="historie">
      <thead><tr><th>Gebiet</th><th>Kriterien</th><th>Status</th><th></th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>`;
}

export function renderGebieteSeite(gebiete: Gebiet[]): string {
  const liste =
    gebiete.length === 0
      ? '    <p class="meta">Noch keine Beobachtungsgebiete – unten das erste anlegen.</p>'
      : gebieteTabelle(gebiete);

  return seite(
    'Beobachtungsgebiete',
    `  <header>
    <h1>immo-radar · Beobachtungsgebiete</h1>
    <p class="meta">Aktive Gebiete werden einmal täglich gecrawlt und bauen den historisierten
    Inseratsbestand auf (Preisentwicklung, Vermarktungsdauer, Preissenkungen).</p>
    <p class="meta"><a href="/">← Zurück zur Suche</a></p>
  </header>

  <section>
    <h2>Gebiete</h2>
${liste}
  </section>

  <section>
    <h2>Neues Gebiet anlegen</h2>
    <form action="/gebiete" method="post">
      <fieldset>
        <label class="feld" for="name">Name</label>
        <input type="text" id="name" name="name" required placeholder="z. B. Villach Zentrum">
      </fieldset>

${kriterienFelder('Gecrawlt wird immer Kauf & Miete – der Typ filtert nur die Auswertung.')}

      <button type="submit">Gebiet anlegen</button>
    </form>
  </section>

  <footer class="meta">
    <p>Tipp: Gebiete eng fassen (Ort/Bezirk statt ganzem Bundesland) – die Portale liefern
    max. ≈150 bzw. ≈75 Inserate pro Segment, große Gebiete sind daher nur eine Stichprobe.
    Preisfenster großzügig wählen: Inserate, die es per Preisänderung verlassen, gelten als delistet.</p>
  </footer>`,
  );
}

/** Platzhalter, solange noch kein Crawl-Lauf des Gebiets fertig ist. */
export function renderGebietOhneDatenSeite(gebiet: Gebiet): string {
  return seite(
    escapeHtml(gebiet.name),
    `  <header><h1>${escapeHtml(gebiet.name)}</h1></header>
  <section>
    <p>${escapeHtml(kriterienZusammenfassung(gebiet.kriterien))}</p>
    <p class="meta">Noch keine Daten – der erste Crawl-Lauf dieses Gebiets steht aus
    (der Scheduler crawlt aktive Gebiete einmal täglich, spätestens beim nächsten Tick).</p>
    <form method="post" action="/gebiete/${gebiet.id}/aktualisieren">
      <button>Jetzt crawlen</button>
    </form>
    <p><a href="/gebiete">← Zurück zu den Gebieten</a></p>
  </section>`,
  );
}

export interface GebietSeitenDaten {
  /** Datum des letzten erfolgreichen Laufs = Stand des Aktiv-Snapshots. */
  stichtag: string;
  trend: TrendPunkt[];
  vermarktung: { kauf: VermarktungsStatistik | null; miete: VermarktungsStatistik | null };
  reduktionen: PreisReduktion[];
  laeufe: CrawlLauf[];
  anzahlAktiv: number;
  anzahlDelisted: number;
}

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

const nfEur0 = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const nfTage = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const nfPct = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });
const nfZeit = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' });

function vermarktungsWert(s: VermarktungsStatistik | null): string {
  if (!s) return '–';
  return `${nfTage.format(s.medianTage)} Tage`;
}

function vermarktungsSub(s: VermarktungsStatistik | null): string {
  if (!s) return 'noch keine delisteten Inserate';
  return `Median aus ${s.anzahl} delisteten Inseraten (Ø ${nfTage.format(s.meanTage)} Tage)`;
}

function reduktionenTabelle(reduktionen: PreisReduktion[]): string {
  if (reduktionen.length === 0) {
    return '    <p class="meta">Keine aktiven Inserate mit gesenktem Preis.</p>';
  }
  const zeilen = reduktionen
    .map((r) => {
      const i = r.inserat;
      const titel = `${i.ort} · ${nfEur0.format(i.flaeche_m2)} m² · ${nfEur0.format(i.zimmer)} Zi.`;
      const link = i.url ? `<a href="${escapeHtml(i.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
      const delta = (r.neuerPreis - r.alterPreis) / r.alterPreis;
      return `      <tr>
        <td>${link}<span class="sub">${i.typ === 'kauf' ? 'Kauf' : 'Miete'} · ${escapeHtml(i.id)}</span></td>
        <td class="num">${nfEur0.format(r.alterPreis)} €</td>
        <td class="num"><strong>${nfEur0.format(r.neuerPreis)} €</strong></td>
        <td class="num gesenkt">−${nfPct.format(Math.abs(delta) * 100)} %</td>
        <td class="meta">${escapeHtml(r.geaendertAm)}</td>
      </tr>`;
    })
    .join('\n');
  return `    <table>
      <thead><tr><th>Inserat</th><th class="num">alt</th><th class="num">neu</th><th class="num">Δ</th><th>geändert am</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>`;
}

function laeufeTabelle(laeufe: CrawlLauf[]): string {
  const zeilen = laeufe
    .map(
      (l) => `      <tr>
        <td>${escapeHtml(l.laufDatum)}</td>
        <td><span class="status-badge status-${l.status}">${l.status}</span></td>
        <td class="num">${l.inserateGesehen ?? ''}</td>
        <td class="meta">${l.fehler ? escapeHtml(l.fehler) : escapeHtml(l.quellen.join(' · '))}</td>
      </tr>`,
    )
    .join('\n');
  return `    <table>
      <thead><tr><th>Tag</th><th>Status</th><th class="num">Inserate</th><th>Quellen / Fehler</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>`;
}

/** Auswertungsseite eines Gebiets: Kacheln, Trend-Charts, Reduktionen, Läufe. */
export function renderGebietSeite(gebiet: Gebiet, daten: GebietSeitenDaten): string {
  const trendJson = JSON.stringify(daten.trend).replace(/</g, '\\u003c'); // "</script>"-sicher

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>immo-radar · ${escapeHtml(gebiet.name)}</title>
<style>
  :root {
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --grid: #e1e0d9;
    --baseline: #c3c2b7;
    --border: rgba(11,11,11,0.10);
    --series-kauf: #2a78d6;
    --series-miete: #1baf7a;
    --status-critical: #d03b3b;
    --status-good: #2e7d43;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0d0d0d;
      --surface-1: #1a1a19;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --grid: #2c2c2a;
      --baseline: #383835;
      --border: rgba(255,255,255,0.10);
      --series-kauf: #3987e5;
      --series-miete: #199e70;
      --status-critical: #d03b3b;
      --status-good: #58b06f;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: var(--page); color: var(--text-primary);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 1080px; margin: 0 auto; display: grid; gap: 20px; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .meta { color: var(--text-secondary); font-size: 13px; }
  section {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px;
  }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .tile { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .tile-label { color: var(--text-secondary); font-size: 13px; }
  .tile-value { font-size: 30px; font-weight: 600; margin: 2px 0 6px; }
  .tile-sub { font-size: 12px; color: var(--text-muted); }
  .charts-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
  .chart-box { min-width: 0; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--grid); }
  thead th { color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--baseline); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td .sub { display: block; font-weight: 400; font-size: 12px; color: var(--text-muted); }
  .gesenkt { color: var(--status-good); font-weight: 600; }
  .status-badge { font-size: 12px; font-weight: 600; white-space: nowrap; }
  .status-laufend { color: var(--series-kauf); }
  .status-fertig { color: var(--status-good); }
  .status-fehlgeschlagen { color: var(--status-critical); }
  a { color: var(--series-kauf); }
  .kopf-aktionen { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .kopf-aktionen p { margin: 0; }
  button.klein {
    padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer;
    color: var(--series-kauf); background: transparent;
    border: 1px solid var(--grid); border-radius: 6px;
  }
  footer { color: var(--text-muted); font-size: 12px; }
  footer p { margin: 4px 0; }
</style>
</head>
<body>
<main>
  <header>
    <h1>immo-radar · ${escapeHtml(gebiet.name)}</h1>
    <p class="meta">${escapeHtml(kriterienZusammenfassung(gebiet.kriterien))} · Bestand, Stand ${escapeHtml(daten.stichtag)}</p>
    <div class="kopf-aktionen">
      <p class="meta"><a href="/gebiete">← Alle Gebiete</a> · <a href="/gebiete/${gebiet.id}/report">Aktueller Marktreport →</a></p>
      <form method="post" action="/gebiete/${gebiet.id}/aktualisieren">
        <button class="klein">Jetzt crawlen</button>
      </form>
    </div>
  </header>

  <section>
    <div class="tiles">
      <div class="tile">
        <div class="tile-label">Aktive Inserate</div>
        <div class="tile-value">${daten.anzahlAktiv}</div>
        <div class="tile-sub">zuletzt gesehen am Stichtag</div>
      </div>
      <div class="tile">
        <div class="tile-label">Delistet</div>
        <div class="tile-value">${daten.anzahlDelisted}</div>
        <div class="tile-sub">vermutlich verkauft/vermietet</div>
      </div>
      <div class="tile">
        <div class="tile-label">Vermarktungsdauer Kauf</div>
        <div class="tile-value">${vermarktungsWert(daten.vermarktung.kauf)}</div>
        <div class="tile-sub">${vermarktungsSub(daten.vermarktung.kauf)}</div>
      </div>
      <div class="tile">
        <div class="tile-label">Vermarktungsdauer Miete</div>
        <div class="tile-value">${vermarktungsWert(daten.vermarktung.miete)}</div>
        <div class="tile-sub">${vermarktungsSub(daten.vermarktung.miete)}</div>
      </div>
    </div>
  </section>

  <section>
    <h2>Median €/m² über die Zeit</h2>
    <div class="charts-2">
      <div class="chart-box">
        <div class="chart-title">Kauf (€/m²)</div>
        <div class="chart-wrap"><canvas id="trend-kauf" role="img" aria-label="Liniendiagramm: Median-Kaufpreis in Euro pro Quadratmeter über die Zeit."></canvas></div>
      </div>
      <div class="chart-box">
        <div class="chart-title">Miete kalt (€/m²)</div>
        <div class="chart-wrap"><canvas id="trend-miete" role="img" aria-label="Liniendiagramm: Median-Kaltmiete in Euro pro Quadratmeter über die Zeit."></canvas></div>
      </div>
    </div>
  </section>

  <section>
    <h2>Preissenkungen (aktive Inserate)</h2>
${reduktionenTabelle(daten.reduktionen)}
  </section>

  <section>
    <h2>Letzte Crawl-Läufe</h2>
${laeufeTabelle(daten.laeufe)}
  </section>

  <footer>
    <p><strong>Methodik:</strong> Aktiv = im letzten erfolgreichen Crawl-Lauf gesehen; Delisting ist nur
      ein Proxy für verkauft/vermietet (Inserate können auch zurückgezogen worden sein).
      Vermarktungsdauer = zuletzt − zuerst gesehen; Inserate aus dem allerersten Crawl sind
      links-zensiert (waren evtl. schon länger online). Trend: Median €/m² der am Stichtag
      aktiven Inserate, Wochenraster, Preise aus der Preishistorie rekonstruiert.</p>
    <p>Erstellt ${escapeHtml(nfZeit.format(new Date()))} · Datenbasis: willhaben.at + immoscout24.at,
      ohne portal-übergreifende Deduplizierung.</p>
  </footer>
</main>

<script>const TREND = ${trendJson};</script>
<script src="${CHART_JS_CDN}"></script>
<script>
(function () {
  'use strict';
  if (typeof Chart === 'undefined') {
    document.querySelectorAll('.chart-wrap').forEach((el) => {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Diagramm nicht verfügbar '
        + '(Chart.js-CDN nicht erreichbar – Internetverbindung nötig).</p>';
    });
    return;
  }
  const nfEur = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
  const nfEur2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  let charts = [];

  function linie(canvasId, werte, anzahlen, farbeVar, format) {
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
        animation: false,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, // eine Serie: Panel-Titel benennt sie
          tooltip: {
            callbacks: {
              label: (c) => format(c.parsed.y) + ' €/m² (' + anzahlen[c.dataIndex] + ' Inserate)',
            },
          },
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
      linie('trend-kauf', TREND.map((t) => t.medianKaufEurM2), TREND.map((t) => t.anzahlKauf),
        '--series-kauf', (v) => nfEur.format(Math.round(v))),
      linie('trend-miete', TREND.map((t) => t.medianMieteEurM2), TREND.map((t) => t.anzahlMiete),
        '--series-miete', (v) => nfEur2.format(v)),
    ];
  }

  renderAll();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
})();
</script>
</body>
</html>
`;
}
