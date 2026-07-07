import type { AnalyseErgebnis, GebietStatistik, InseratAnalyse } from './analyze.js';
import { fmtRendite } from './pages/format.js';
import { escapeHtml, seite } from './pages/layout.js';

export interface ReportMeta {
  quellen: string[];
  erstellt: string; // ISO-Datum
  /** Region für die Überschrift (Standard: Kärnten, das V1-Beispielgebiet). */
  region?: string;
  /** Kontextueller Rücksprung (derzeit ungenutzt; der Report ist CLI-only). */
  zurueck?: { href: string; label: string };
}

/** Ziel-Bruttorendite, ab der ein Gebiet im Report hervorgehoben wird. */
export const ZIEL_RENDITE = 0.04;

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

const nfEur0 = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const nfEur2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtEurM2(wert: number, typ: 'kauf' | 'miete'): string {
  return typ === 'kauf' ? nfEur0.format(Math.round(wert)) : nfEur2.format(wert);
}

function segmentZellen(g: GebietStatistik, typ: 'kauf' | 'miete'): string {
  const s = typ === 'kauf' ? g.kauf : g.miete;
  if (!s) return '<td class="num">–</td><td class="num">–</td><td class="num">–</td><td class="num">–</td>';
  return (
    `<td class="num">${s.anzahl}</td>` +
    `<td class="num"><strong>${fmtEurM2(s.medianEurM2, typ)}</strong></td>` +
    `<td class="num">${fmtEurM2(s.meanEurM2, typ)}</td>` +
    `<td class="num">${fmtEurM2(s.minEurM2, typ)}–${fmtEurM2(s.maxEurM2, typ)}</td>`
  );
}

function renditeBadge(g: GebietStatistik): string {
  const erreicht = g.bruttoRendite !== null && g.bruttoRendite >= ZIEL_RENDITE;
  if (erreicht) return '<span class="badge badge-good">✓ Ziel ≥ 4 % erreicht</span>';
  if (g.bruttoRendite === null) return '<span class="badge badge-muted">keine Miet- oder Kaufdaten</span>';
  return '<span class="badge badge-muted">unter 4 %-Ziel</span>';
}

/** Beste Rendite zuerst – der Leser soll nicht suchen müssen. */
function nachRendite(gebiete: GebietStatistik[]): GebietStatistik[] {
  return [...gebiete].sort((a, b) => (b.bruttoRendite ?? -1) - (a.bruttoRendite ?? -1));
}

function renditeTiles(gebiete: GebietStatistik[]): string {
  return gebiete
    .map((g) => {
      const erreicht = g.bruttoRendite !== null && g.bruttoRendite >= ZIEL_RENDITE;
      const wert = g.bruttoRendite === null ? '–' : fmtRendite(g.bruttoRendite);
      return `<div class="tile${erreicht ? ' tile-good' : ''}">
        <div class="tile-label">${escapeHtml(g.gebiet)}</div>
        <div class="tile-value">${wert}</div>
        ${renditeBadge(g)}
      </div>`;
    })
    .join('\n');
}

/**
 * Ab mehr als 8 Gebieten kippen die Kacheln in eine unlesbare Wand –
 * dann trägt eine kompakte Tabelle dasselbe Urteil besser.
 */
function renditeUebersicht(gebiete: GebietStatistik[]): string {
  const sortiert = nachRendite(gebiete);
  if (sortiert.length <= 8) {
    return `<div class="tiles">\n${renditeTiles(sortiert)}\n    </div>`;
  }
  const zeilen = sortiert
    .map(
      (g) => `      <tr>
        <th scope="row">${escapeHtml(g.gebiet)}</th>
        <td class="num">${g.bruttoRendite === null ? '–' : fmtRendite(g.bruttoRendite)}</td>
        <td>${renditeBadge(g)}</td>
      </tr>`,
    )
    .join('\n');
  return `<div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Gebiet</th><th scope="col" class="num">Brutto-Rendite</th><th scope="col"><span class="sr-nur">Urteil</span></th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function vergleichsTabelle(gebiete: GebietStatistik[]): string {
  const zeilen = gebiete
    .map((g) => {
      const erreicht = g.bruttoRendite !== null && g.bruttoRendite >= ZIEL_RENDITE;
      const rendite =
        g.bruttoRendite === null
          ? '–'
          : erreicht
            ? `<strong class="good">✓ ${fmtRendite(g.bruttoRendite)}</strong>`
            : fmtRendite(g.bruttoRendite);
      const subTeile = [g.plz, g.bezirk].filter((t) => t !== '').map(escapeHtml);
      const sub = subTeile.length > 0 ? `<span class="sub">${subTeile.join(' · ')}</span>` : '';
      return `<tr>
        <th scope="row">${escapeHtml(g.gebiet)}${sub}</th>
        ${segmentZellen(g, 'kauf')}
        ${segmentZellen(g, 'miete')}
        <td class="num">${rendite}</td>
      </tr>`;
    })
    .join('\n');

  return `<div class="tabelle-scroll">
    <table>
    <thead>
      <tr>
        <th rowspan="2" scope="col">Gebiet</th>
        <th colspan="4" scope="colgroup">Kauf (€/m²)</th>
        <th colspan="4" scope="colgroup">Miete kalt (€/m²)</th>
        <th rowspan="2" scope="col">Brutto-Rendite</th>
      </tr>
      <tr>
        <th scope="col">n</th><th scope="col">Median</th><th scope="col">Ø</th><th scope="col">Min–Max</th>
        <th scope="col">n</th><th scope="col">Median</th><th scope="col">Ø</th><th scope="col">Min–Max</th>
      </tr>
    </thead>
    <tbody>${zeilen}</tbody>
    </table>
    </div>`;
}

function inserateTabelle(inserate: InseratAnalyse[]): string {
  const sortiert = [...inserate].sort(
    (a, b) => a.ort.localeCompare(b.ort, 'de') || a.typ.localeCompare(b.typ) || a.eurM2 - b.eurM2,
  );
  const zeilen = sortiert
    .map((i) => {
      const id = i.url ? `<a href="${escapeHtml(i.url)}">${escapeHtml(i.id)}</a>` : escapeHtml(i.id);
      return `<tr${i.istAusreisser ? ' class="row-outlier"' : ''}>
        <td>${id}</td>
        <td>${i.typ === 'kauf' ? 'Kauf' : 'Miete'}</td>
        <td>${escapeHtml(i.ort)}</td>
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${nfEur2.format(i.flaeche_m2)}</td>
        <td class="num">${fmtEurM2(i.eurM2, i.typ)}</td>
        <td>${i.zustand ? escapeHtml(i.zustand) : '–'}</td>
        <td>${i.istAusreisser ? '<span class="badge badge-critical">▲ Ausreißer</span>' : ''}</td>
      </tr>`;
    })
    .join('\n');

  return `<div class="tabelle-scroll">
    <table>
    <thead><tr>
      <th scope="col">Inserat</th><th scope="col">Typ</th><th scope="col">Ort</th>
      <th scope="col">Preis</th><th scope="col">m²</th><th scope="col">€/m²</th>
      <th scope="col">Zustand</th><th scope="col"><span class="sr-nur">Auffälligkeit</span></th>
    </tr></thead>
    <tbody>${zeilen}</tbody>
    </table>
    </div>`;
}

/** Seitenspezifisches CSS des Marktreports (Tiles, Badges, Charts, Ausreißer-Zeilen). */
const REPORT_CSS = `
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .tile { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .tile-good { background: var(--good-bg); }
  .tile-label { color: var(--text-secondary); font-size: 13px; }
  .tile-value { font-size: 30px; font-weight: 600; margin: 2px 0 6px; }
  .badge { font-size: 12px; color: var(--text-secondary); }
  .badge-good { color: var(--good-text); font-weight: 600; }
  .badge-critical { color: var(--status-critical); font-weight: 600; font-size: 12px; }
  .good { color: var(--good-text); }
  .charts-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
  .chart-box { min-width: 0; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  .row-outlier td { background: color-mix(in srgb, var(--status-critical) 6%, transparent); }
`;

export function renderReport(ergebnis: AnalyseErgebnis, meta: ReportMeta): string {
  const { gebiete, inserate } = ergebnis;
  const chartDaten = {
    gebiete: gebiete.map((g) => ({
      gebiet: g.gebiet,
      kaufMedian: g.kauf?.medianEurM2 ?? null,
      mieteMedian: g.miete?.medianEurM2 ?? null,
    })),
    inserate: inserate.map((i) => ({
      id: i.id,
      typ: i.typ,
      ort: i.ort,
      preis: i.preis,
      flaeche: i.flaeche_m2,
      eurM2: i.eurM2,
      zustand: i.zustand ?? null,
      ausreisser: i.istAusreisser,
    })),
  };
  // "</script>"-sicher einbetten
  const datenJson = JSON.stringify(chartDaten).replace(/</g, '\\u003c');
  const anzahlKauf = inserate.filter((i) => i.typ === 'kauf').length;
  const anzahlMiete = inserate.length - anzahlKauf;

  const zurueck = meta.zurueck
    ? `\n    <p class="meta"><a href="${escapeHtml(meta.zurueck.href)}">${escapeHtml(meta.zurueck.label)}</a></p>`
    : '';

  const inhalt = `  <header>
    <h1>Marktanalyse ${escapeHtml(meta.region ?? 'Kärnten')}</h1>
    <p class="meta">Erstellt am ${escapeHtml(meta.erstellt)} · ${inserate.length} Inserate
      (${anzahlKauf} Kauf, ${anzahlMiete} Miete) · Quellen: ${meta.quellen.map(escapeHtml).join(', ')}</p>${zurueck}
  </header>

  <section>
    <h2>Brutto-Mietrendite pro Gebiet</h2>
    ${renditeUebersicht(gebiete)}
  </section>

  <section>
    <h2>Vergleich der Gebiete</h2>
${vergleichsTabelle(gebiete)}
  </section>

  <section>
    <h2>Median €/m² pro Gebiet</h2>
    <div class="charts-2">
      <div class="chart-box">
        <div class="chart-title">Kauf (€/m²)</div>
        <div class="chart-wrap"><canvas id="chart-kauf" role="img" aria-label="Balkendiagramm: Median-Kaufpreis in Euro pro Quadratmeter je Gebiet. Werte stehen in der Vergleichstabelle."></canvas></div>
      </div>
      <div class="chart-box">
        <div class="chart-title">Miete kalt (€/m²)</div>
        <div class="chart-wrap"><canvas id="chart-miete" role="img" aria-label="Balkendiagramm: Median-Kaltmiete in Euro pro Quadratmeter je Gebiet. Werte stehen in der Vergleichstabelle."></canvas></div>
      </div>
    </div>
  </section>

  <section>
    <h2>Fläche vs. Preis (Ausreißer markiert)</h2>
    <div class="charts-2">
      <div class="chart-box">
        <div class="chart-title">Kauf: Fläche (m²) vs. Kaufpreis (€)</div>
        <div class="chart-wrap"><canvas id="scatter-kauf" role="img" aria-label="Streudiagramm Fläche gegen Kaufpreis, Ausreißer als rote Rauten markiert. Alle Werte stehen in der Inseratstabelle."></canvas></div>
      </div>
      <div class="chart-box">
        <div class="chart-title">Miete: Fläche (m²) vs. Kaltmiete (€/Monat)</div>
        <div class="chart-wrap"><canvas id="scatter-miete" role="img" aria-label="Streudiagramm Fläche gegen Kaltmiete, Ausreißer als rote Rauten markiert. Alle Werte stehen in der Inseratstabelle."></canvas></div>
      </div>
    </div>
  </section>

  <section>
    <h2>Alle Inserate</h2>
${inserateTabelle(inserate)}
  </section>

  <footer>
    <p><strong>Methodik:</strong> Median/Quartile mit linearer Interpolation (R-7). Als Ausreißer gilt ein
      Inserat, dessen €/m² weit außerhalb des üblichen Bereichs seines Gebiets liegt (mehr als das
      1,5-Fache des Interquartilsabstands unter dem unteren bzw. über dem oberen Viertel — die
      übliche 1,5×IQR-Regel; je Gebiet und Typ, erst ab 4 Inseraten bewertet).
      Brutto-Mietrendite = (Median-Kaltmiete €/m² × 12) / Median-Kaufpreis €/m² — ohne Nebenkosten,
      Betriebskosten, Leerstand oder Kaufnebenkosten (Nettorendite folgt in V2).</p>
    <p>Datenbasis: manuell erfasste Inserate — kein Anspruch auf Marktvollständigkeit.</p>
  </footer>

  <script>const DATA = ${datenJson};</script>
<script src="${CHART_JS_CDN}"></script>
<script>
(function () {
  'use strict';
  if (typeof Chart === 'undefined') {
    // CDN nicht erreichbar (offline): Hinweis statt leerer Flächen; Tabellen tragen die Werte.
    document.querySelectorAll('.chart-wrap').forEach((el) => {
      el.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">Diagramm nicht verfügbar '
        + '(Chart.js-CDN nicht erreichbar – Internetverbindung nötig). '
        + 'Alle Werte stehen in den Tabellen.</p>';
    });
    return;
  }
  const nfEur = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
  const nfEur2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const GEBIETE = [...new Set(DATA.inserate.map((i) => i.ort))].sort((a, b) => a.localeCompare(b, 'de'));
  // Feste Slot-Reihenfolge (CVD-validiert), niemals zyklisch: ab dem 8. Gebiet wird gefaltet.
  const SLOT_VARS = ['--series-kauf', '--series-miete', '--series-3'];
  let charts = [];

  function gebietFarbe(idx) {
    return idx < SLOT_VARS.length ? cssVar(SLOT_VARS[idx]) : cssVar('--text-muted');
  }

  // Werte direkt an der Balkenspitze (selektiv: eine Serie, wenige Balken)
  const valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw(chart, _args, opts) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 11px ' + FONT;
      ctx.fillStyle = cssVar('--text-secondary');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.getDatasetMeta(0).data.forEach((el, i) => {
        const v = chart.data.datasets[0].data[i];
        if (v !== null) ctx.fillText(opts.format(v), el.x, el.y - 5);
      });
      ctx.restore();
    },
  };

  function balken(canvasId, werte, farbeVar, format) {
    return new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: DATA.gebiete.map((g) => g.gebiet),
        datasets: [{
          data: werte,
          backgroundColor: cssVar(farbeVar),
          maxBarThickness: 24,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
        }],
      },
      plugins: [valueLabels],
      options: {
        animation: false, // statischer Report – sofort zeichnen
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false }, // eine Serie: Panel-Titel benennt sie
          valueLabels: { format },
          tooltip: { callbacks: { label: (c) => format(c.parsed.y) + ' €/m²' } },
        },
        scales: {
          x: { grid: { display: false }, border: { color: cssVar('--baseline') },
               ticks: { color: cssVar('--text-secondary'), font: { family: FONT } } },
          y: { beginAtZero: true, grid: { color: cssVar('--grid') }, border: { display: false },
               ticks: { color: cssVar('--text-muted'), font: { family: FONT },
                        callback: (v) => nfEur.format(v) } },
        },
      },
    });
  }

  function streu(canvasId, typ, preisFormat) {
    const punkte = DATA.inserate.filter((i) => i.typ === typ);
    const datasets = GEBIETE.map((ort, idx) => ({
      label: ort,
      data: punkte.filter((i) => i.ort === ort && !i.ausreisser)
        .map((i) => ({ x: i.flaeche, y: i.preis, inserat: i })),
      backgroundColor: gebietFarbe(idx),
      borderColor: cssVar('--surface-1'), // 2px Surface-Ring
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
    }));
    datasets.push({
      label: 'Ausreißer (1,5×IQR)',
      data: punkte.filter((i) => i.ausreisser).map((i) => ({ x: i.flaeche, y: i.preis, inserat: i })),
      backgroundColor: cssVar('--status-critical'),
      borderColor: cssVar('--surface-1'),
      borderWidth: 2,
      pointStyle: 'rectRot', // eigene Form: Markierung hängt nicht an Farbe allein
      pointRadius: 7,
      pointHoverRadius: 9,
    });
    return new Chart(document.getElementById(canvasId), {
      type: 'scatter',
      data: { datasets },
      options: {
        animation: false,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, color: cssVar('--text-secondary'),
                      font: { family: FONT }, boxWidth: 8, boxHeight: 8 },
          },
          tooltip: {
            callbacks: {
              label: (c) => {
                const i = c.raw.inserat;
                return i.id + ' · ' + i.ort + ' · ' + nfEur2.format(i.flaeche) + ' m² · '
                  + preisFormat(i.preis) + ' · ' + (typ === 'kauf'
                    ? nfEur.format(Math.round(i.eurM2)) : nfEur2.format(i.eurM2)) + ' €/m²'
                  + (i.zustand ? ' · ' + i.zustand : '')
                  + (i.ausreisser ? ' · AUSREISSER' : '');
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: 'Fläche (m²)', color: cssVar('--text-muted'), font: { family: FONT } },
               grid: { color: cssVar('--grid') }, border: { color: cssVar('--baseline') },
               ticks: { color: cssVar('--text-muted'), font: { family: FONT } } },
          y: { title: { display: true, text: typ === 'kauf' ? 'Kaufpreis (€)' : 'Kaltmiete (€/Monat)',
                        color: cssVar('--text-muted'), font: { family: FONT } },
               grid: { color: cssVar('--grid') }, border: { display: false },
               ticks: { color: cssVar('--text-muted'), font: { family: FONT },
                        callback: (v) => nfEur.format(v) } },
        },
      },
    });
  }

  function renderAll() {
    charts.forEach((c) => c.destroy());
    charts = [
      balken('chart-kauf', DATA.gebiete.map((g) => g.kaufMedian), '--series-kauf',
        (v) => nfEur.format(Math.round(v))),
      balken('chart-miete', DATA.gebiete.map((g) => g.mieteMedian), '--series-miete',
        (v) => nfEur2.format(v)),
      streu('scatter-kauf', 'kauf', (p) => nfEur.format(p) + ' €'),
      streu('scatter-miete', 'miete', (p) => nfEur.format(p) + ' €/Monat'),
    ];
  }

  renderAll();
  // Dark-Mode-Wechsel: Charts mit den Farben des neuen Modus neu aufbauen
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
})();
</script>`;

  // Der Report wird statisch exportiert (CLI) — ohne Navbar, die Links
  // liefen ohne Server ins Leere.
  return seite(`Marktanalyse ${meta.erstellt}`, inhalt, {
    breite: 'breit',
    extraCss: REPORT_CSS,
    navbar: false,
  });
}
