import type { CrawlLauf, Gebiet } from '../db/gebiete-repo.js';
import type { PreisReduktion, TrendPunkt, VermarktungsStatistik } from '../trend.js';
import { escapeHtml, FORMULAR_CSS, seite } from './layout.js';
import { bereichsPruefungJs, formFehlerBlock, kriterienFelder, type FormFehler } from './search-page.js';
import { kriterienZusammenfassung, STATUS_TEXT } from './suchen-pages.js';

/** Verwaltungs- und Auswertungsseiten der Beobachtungsgebiete (Watchlist). */

const CRAWL_BADGE = '<span class="status-badge status-laufend">Crawl läuft …</span>';

/**
 * Auto-Refresh, solange ein Crawl läuft – nur für Seiten ohne Formular-Eingaben
 * (Gebiet-Detail/Platzhalter). Auf der Listen-Seite mit dem Anlege-Formular wäre
 * ein Reload Datenverlust: dort zeigt nur das Badge den Zustand.
 */
function refreshBeiCrawl(crawlLaeuft: boolean): string {
  return crawlLaeuft ? '<meta http-equiv="refresh" content="10">\n' : '';
}

function gebieteTabelle(gebiete: Gebiet[], laufende: Set<number>): string {
  const zeilen = gebiete
    .map((g) => {
      const schalter = g.aktiv
        ? `<form method="post" action="/gebiete/${g.id}/deaktivieren"><button class="klein">deaktivieren</button></form>`
        : `<form method="post" action="/gebiete/${g.id}/aktivieren"><button class="klein">aktivieren</button></form>`;
      const crawlen = laufende.has(g.id)
        ? `<form method="post" action="/gebiete/${g.id}/aktualisieren"><button class="klein" disabled>jetzt crawlen</button></form>`
        : `<form method="post" action="/gebiete/${g.id}/aktualisieren"><button class="klein">jetzt crawlen</button></form>`;
      const loeschen = `<form method="post" action="/gebiete/${g.id}/loeschen" data-name="${escapeHtml(g.name)}"
          onsubmit="return confirm('Gebiet „' + this.dataset.name + '“ endgültig löschen? Die Crawl-Historie des Gebiets geht dabei verloren.')"><button class="klein kritisch">löschen</button></form>`;
      const status = laufende.has(g.id)
        ? CRAWL_BADGE
        : `<span class="status-badge status-${g.aktiv ? 'aktiv' : 'inaktiv'}">${g.aktiv ? 'aktiv' : 'inaktiv'}</span>`;
      return `      <tr>
        <td><a href="/gebiete/${g.id}">${escapeHtml(g.name)}</a></td>
        <td class="meta">${escapeHtml(kriterienZusammenfassung(g.kriterien))}</td>
        <td>${status}</td>
        <td><div class="aktionen">${crawlen}${schalter}${loeschen}</div></td>
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table class="historie">
      <thead><tr><th scope="col">Gebiet</th><th scope="col">Kriterien</th><th scope="col">Status</th><th scope="col"><span class="sr-nur">Aktionen</span></th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

export function renderGebieteSeite(
  gebiete: Gebiet[],
  laufende: Set<number>,
  fehler?: FormFehler,
): string {
  const liste =
    gebiete.length === 0
      ? '    <p class="meta">Noch keine Beobachtungsgebiete – unten das erste anlegen.</p>'
      : gebieteTabelle(gebiete, laufende);
  const nameWert = fehler?.werte.get('name')?.trim();

  return seite(
    'Beobachtungsgebiete',
    `  <header>
    <h1>Beobachtungsgebiete</h1>
    <p class="meta">Aktive Gebiete werden einmal täglich gecrawlt und bauen den historisierten
    Inseratsbestand auf (Preisentwicklung, Vermarktungsdauer, Preissenkungen).</p>
  </header>

  <section>
    <h2>Gebiete</h2>
${liste}
  </section>

  <section>
    <h2>Neues Gebiet anlegen</h2>
    <form action="/gebiete" method="post" id="gebietform">
      <fieldset>
        <label class="feld" for="name">Name</label>
        <input type="text" id="name" name="name" required placeholder="z. B. Villach Zentrum"${nameWert ? ` value="${escapeHtml(nameWert)}"` : ''}>
      </fieldset>

${kriterienFelder('Gecrawlt wird immer Kauf & Miete – der Typ filtert nur die Auswertung.', fehler?.werte)}

${formFehlerBlock(fehler)}      <button type="submit">Gebiet anlegen</button>
    </form>
  </section>

  <footer class="meta">
    <p>Tipp: Gebiete eng fassen (Ort/Bezirk statt ganzem Bundesland) – die Portale liefern
    max. ≈150 bzw. ≈75 Inserate pro Segment, große Gebiete sind daher nur eine Stichprobe.
    Preisfenster großzügig wählen: Inserate, die es per Preisänderung verlassen, gelten als delistet.</p>
  </footer>

  <script>
    document.getElementById('gebietform').addEventListener('submit', function (e) {
      const gueltig = (function (form) {
${bereichsPruefungJs('form')}
      })(this);
      if (!gueltig) e.preventDefault();
    });
  </script>`,
    { aktiv: 'gebiete', extraCss: FORMULAR_CSS },
  );
}

/** Platzhalter, solange noch kein Crawl-Lauf des Gebiets fertig ist. */
export function renderGebietOhneDatenSeite(gebiet: Gebiet, crawlLaeuft: boolean): string {
  const stand = crawlLaeuft
    ? `    <p class="meta" role="status">${CRAWL_BADGE} Der erste Crawl-Lauf ist gestartet –
    das dauert ein paar Sekunden. Die Seite aktualisiert sich automatisch.</p>`
    : `    <p class="meta">Noch keine Daten – der erste Crawl-Lauf dieses Gebiets steht aus
    (der Scheduler crawlt aktive Gebiete einmal täglich, spätestens beim nächsten Tick).</p>
    <form method="post" action="/gebiete/${gebiet.id}/aktualisieren">
      <button>Jetzt crawlen</button>
    </form>`;
  return seite(
    gebiet.name,
    `  <header><h1>${escapeHtml(gebiet.name)}</h1></header>
  <section>
    <p>${escapeHtml(kriterienZusammenfassung(gebiet.kriterien))}</p>
${stand}
  </section>`,
    { aktiv: 'gebiete', kopfExtra: refreshBeiCrawl(crawlLaeuft) },
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
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">alt</th><th scope="col" class="num">neu</th><th scope="col" class="num">Änderung</th><th scope="col">geändert am</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function laeufeTabelle(laeufe: CrawlLauf[]): string {
  const zeilen = laeufe
    .map(
      (l) => `      <tr>
        <td>${escapeHtml(l.laufDatum)}</td>
        <td><span class="status-badge status-${l.status}">${STATUS_TEXT[l.status]}</span></td>
        <td class="num">${l.inserateGesehen ?? ''}</td>
        <td class="meta">${l.fehler ? escapeHtml(l.fehler) : escapeHtml(l.quellen.join(' · '))}</td>
      </tr>`,
    )
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Tag</th><th scope="col">Status</th><th scope="col" class="num">Inserate</th><th scope="col">Quellen / Fehler</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function trendSektion(trend: TrendPunkt[]): string {
  if (trend.length === 0) {
    return `    <p class="meta">Noch zu wenige Crawl-Läufe für einen Trend – nach den nächsten
    Läufen entsteht hier die Zeitreihe des Median-€/m².</p>`;
  }
  return `    <div class="charts-2">
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

/** Seitenspezifisches CSS der Gebiets-Auswertung (Tiles, Charts, Kopf-Aktionen). */
const GEBIET_CSS = `
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .tile { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .tile-label { color: var(--text-secondary); font-size: 13px; }
  .tile-value { font-size: 30px; font-weight: 600; margin: 2px 0 6px; }
  .tile-sub { font-size: 12px; color: var(--text-secondary); }
  .charts-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
  .chart-box { min-width: 0; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  .gesenkt { color: var(--status-good); font-weight: 600; }
  .kopf-aktionen { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .kopf-aktionen p { margin: 0; }
`;

/** Auswertungsseite eines Gebiets: Kacheln, Trend-Charts, Reduktionen, Läufe. */
export function renderGebietSeite(
  gebiet: Gebiet,
  daten: GebietSeitenDaten,
  crawlLaeuft = false,
): string {
  const trendJson = JSON.stringify(daten.trend).replace(/</g, '\\u003c'); // "</script>"-sicher

  const inhalt = `  <header>
    <h1>${escapeHtml(gebiet.name)}</h1>
    <p class="meta">${escapeHtml(kriterienZusammenfassung(gebiet.kriterien))} · Bestand, Stand ${escapeHtml(daten.stichtag)}</p>
    <div class="kopf-aktionen">
      <p class="meta"><a href="/gebiete/${gebiet.id}/report">Aktueller Marktreport →</a></p>
      <form method="post" action="/gebiete/${gebiet.id}/aktualisieren">
        <button class="klein"${crawlLaeuft ? ' disabled' : ''}>Jetzt crawlen</button>
      </form>
      ${crawlLaeuft ? `<p role="status">${CRAWL_BADGE}</p>` : ''}
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
${trendSektion(daten.trend)}
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
      Vermarktungsdauer = zuletzt − zuerst gesehen; Inserate aus dem allerersten Crawl sind dabei
      nur begrenzt aussagekräftig („links-zensiert“: sie waren evtl. schon vor dem ersten Crawl online).
      Trend: Median €/m² der am Stichtag aktiven Inserate, Wochenraster, Preise aus der
      Preishistorie rekonstruiert.</p>
    <p>Erstellt ${escapeHtml(nfZeit.format(new Date()))} · Datenbasis: willhaben.at + immoscout24.at,
      ohne portal-übergreifende Deduplizierung.</p>
  </footer>

  <script>const TREND = ${trendJson};</script>
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
</script>`;

  return seite(gebiet.name, inhalt, {
    breite: 'breit',
    aktiv: 'gebiete',
    extraCss: GEBIET_CSS,
    kopfExtra: refreshBeiCrawl(crawlLaeuft),
  });
}
