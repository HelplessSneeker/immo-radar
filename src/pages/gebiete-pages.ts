import type { BestandInserat } from '../db/bestand-repo.js';
import type { CrawlLauf, Gebiet } from '../db/gebiete-repo.js';
import { tageZwischen } from '../datum.js';
import {
  inseratSchluessel,
  type PreisAenderung,
  type TrendPunkt,
  type VermarktungsStatistik,
} from '../trend.js';
import { escapeHtml, FORMULAR_CSS, seite } from './layout.js';
import { bereichsPruefungJs, formFehlerBlock, kriterienFelder, type FormFehler } from './search-page.js';
import { kriterienZusammenfassung, STATUS_TEXT } from './suchen-pages.js';

/** Verwaltungs- und Auswertungsseiten der Beobachtungsgebiete (Watchlist). */

const CRAWL_BADGE = '<span class="status-badge status-laufend">Crawl läuft</span>';

/**
 * Ab diesem Alter gilt der letzte Crawl eines aktiven Gebiets als überfällig.
 * Der Scheduler crawlt einmal pro UTC-Tag (Tick alle 30 min), knapp über 24 h
 * Abstand sind daher normal – die Schwelle liegt bewusst mit Puffer darüber.
 */
const UEBERFAELLIG_MS = 26 * 60 * 60 * 1000;

function istUeberfaellig(beendetAm: Date): boolean {
  return Date.now() - beendetAm.getTime() > UEBERFAELLIG_MS;
}

/** Frische-Hinweise („noch nie", „überfällig") auf Liste und Detailseite. */
const FRISCHE_CSS = `
  .ueberfaellig { color: var(--status-critical); font-size: 12px; font-weight: 600; white-space: nowrap; }
`;

/**
 * Auto-Refresh, solange ein Crawl läuft – nur für Seiten ohne Formular-Eingaben
 * (Gebiet-Detail/Platzhalter). Auf der Listen-Seite mit dem Anlege-Formular wäre
 * ein Reload Datenverlust: dort zeigt nur das Badge den Zustand.
 *
 * Ohne JS: klassischer Meta-Refresh (großzügig, damit lange Crawls nicht ständig
 * neu laden). Mit JS: Skript hört auf `aktivitaet-aenderung` und lädt genau
 * dann neu, wenn dieses Gebiet in der Aktivität nicht mehr auftaucht – kein
 * sichtbares Flackern durch periodische Reloads.
 */
function refreshBeiCrawl(crawlLaeuft: boolean, gebietId: number): string {
  if (!crawlLaeuft) return '';
  return `<noscript><meta http-equiv="refresh" content="15"></noscript>
<script>
  (function () {
    const meineId = ${gebietId};
    // Wenn wir einmal gesehen haben, dass unser Gebiet läuft, und es danach
    // aus der Aktivität verschwindet, ist der Crawl fertig – dann sanft neu laden.
    let gesehenLaufend = true;
    document.addEventListener('aktivitaet-aenderung', function (e) {
      const laeuft = e.detail.crawls.some(function (c) { return c.gebietId === meineId; });
      if (laeuft) { gesehenLaufend = true; return; }
      if (gesehenLaufend) {
        document.body.classList.add('laufend-fade');
        setTimeout(function () { location.reload(); }, 240);
      }
    });
  })();
</script>
`;
}

const nfEur0 = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const nfEur2 = new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfTage = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const nfPct = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });
const nfZeit = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' });
const nfZeitpunkt = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

/** YYYY-MM-DD als lokales Datum formatieren (T00:00:00 verhindert UTC-Tagessprung). */
function datumMedium(datum: string): string {
  return nfZeit.format(new Date(`${datum}T00:00:00`));
}

function zuletztGecrawltZelle(gebiet: Gebiet, beendetAm: Date | undefined): string {
  if (!beendetAm) {
    // Nur bei aktiven Gebieten ist „noch nie" ein Problem – inaktive soll der
    // Scheduler ja gar nicht crawlen.
    return gebiet.aktiv
      ? '<td><span class="ueberfaellig">noch nie</span></td>'
      : '<td class="meta">noch nie</td>';
  }
  const marker =
    gebiet.aktiv && istUeberfaellig(beendetAm)
      ? ' <span class="ueberfaellig">· überfällig</span>'
      : '';
  return `<td class="meta">${escapeHtml(nfZeitpunkt.format(beendetAm))}${marker}</td>`;
}

function gebieteTabelle(
  gebiete: Gebiet[],
  laufende: Set<number>,
  letzteLaeufe: Map<number, Date>,
): string {
  const zeilen = gebiete
    .map((g) => {
      const schalter = g.aktiv
        ? `<form method="post" action="/gebiete/${g.id}/deaktivieren"><button class="klein">deaktivieren</button></form>`
        : `<form method="post" action="/gebiete/${g.id}/aktivieren"><button class="klein">aktivieren</button></form>`;
      const crawlen = laufende.has(g.id)
        ? `<form method="post" action="/gebiete/${g.id}/aktualisieren"><button class="klein" disabled data-crawlen="${g.id}">jetzt crawlen</button></form>`
        : `<form method="post" action="/gebiete/${g.id}/aktualisieren"><button class="klein" data-crawlen="${g.id}">jetzt crawlen</button></form>`;
      const loeschen = `<form method="post" action="/gebiete/${g.id}/loeschen" data-name="${escapeHtml(g.name)}"
          onsubmit="return confirm('Gebiet „' + this.dataset.name + '“ endgültig löschen? Die Crawl-Historie des Gebiets geht dabei verloren.')"><button class="klein kritisch">löschen</button></form>`;
      const status = laufende.has(g.id)
        ? CRAWL_BADGE
        : `<span class="status-badge status-${g.aktiv ? 'aktiv' : 'inaktiv'}">${g.aktiv ? 'aktiv' : 'inaktiv'}</span>`;
      return `      <tr data-gebiet-id="${g.id}" data-aktiv="${g.aktiv ? '1' : '0'}">
        <td><a href="/gebiete/${g.id}">${escapeHtml(g.name)}</a></td>
        <td class="meta">${escapeHtml(kriterienZusammenfassung(g.kriterien))}</td>
        ${zuletztGecrawltZelle(g, letzteLaeufe.get(g.id))}
        <td class="status-zelle">${status}</td>
        <td><div class="aktionen">${crawlen}${schalter}${loeschen}</div></td>
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table class="historie" id="gebiete-tabelle">
      <thead><tr><th scope="col">Gebiet</th><th scope="col">Kriterien</th><th scope="col">Zuletzt gecrawlt</th><th scope="col">Status</th><th scope="col"><span class="sr-nur">Aktionen</span></th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

export function renderGebieteSeite(
  gebiete: Gebiet[],
  laufende: Set<number>,
  letzteLaeufe: Map<number, Date>,
  fehler?: FormFehler,
): string {
  const liste =
    gebiete.length === 0
      ? '    <p class="meta">Noch keine Beobachtungsgebiete – unten das erste anlegen.</p>'
      : gebieteTabelle(gebiete, laufende, letzteLaeufe);
  const nameWert = fehler?.werte.get('name')?.trim();

  return seite(
    'Beobachtungsgebiete',
    `  <header>
    <h1>Beobachtungsgebiete</h1>
    <p class="meta">Beobachtungsgebiete verfolgen Kauf- und Mietpreise vergleichbarer Wohnungen
    über die Zeit – aktive Gebiete werden einmal täglich gecrawlt und bauen den historisierten
    Inseratsbestand auf (Preisverlauf je Inserat, Vermarktungsdauer, Trends).</p>
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

    // Live-Update der Zeilen-Badges bei laufenden Crawls: statt Meta-Refresh
    // (der das Formular oben leeren würde) hört die Seite auf den globalen
    // Aktivitäts-Poll und tauscht in-place die Status-Zelle und den Zustand
    // des „jetzt crawlen"-Buttons je Gebiet aus.
    (function () {
      const tabelle = document.getElementById('gebiete-tabelle');
      if (!tabelle) return;
      // Beim ersten Poll ist die Aktivität die Wahrheit – auch Zeilen, die
      // server-seitig als „aktiv" gerendert wurden, können jetzt schon laufen.
      document.addEventListener('aktivitaet-aenderung', function (e) {
        const laufend = new Set(e.detail.crawls.map(function (c) { return c.gebietId; }));
        tabelle.querySelectorAll('tr[data-gebiet-id]').forEach(function (tr) {
          const id = Number(tr.dataset.gebietId);
          const aktiv = tr.dataset.aktiv === '1';
          const zelle = tr.querySelector('.status-zelle');
          const knopf = tr.querySelector('button[data-crawlen]');
          if (laufend.has(id)) {
            zelle.innerHTML = '<span class="status-badge status-laufend">Crawl läuft</span>';
            if (knopf) knopf.disabled = true;
          } else {
            zelle.innerHTML = '<span class="status-badge status-' + (aktiv ? 'aktiv' : 'inaktiv') + '">' + (aktiv ? 'aktiv' : 'inaktiv') + '</span>';
            if (knopf) knopf.disabled = false;
          }
        });
      });
    })();
  </script>`,
    { aktiv: 'gebiete', extraCss: FORMULAR_CSS + FRISCHE_CSS },
  );
}

/** Platzhalter, solange noch kein Crawl-Lauf des Gebiets fertig ist. */
export function renderGebietOhneDatenSeite(gebiet: Gebiet, crawlLaeuft: boolean): string {
  const stand = crawlLaeuft
    ? `    <div class="fortschritt" role="progressbar" aria-label="Crawl läuft" aria-valuetext="unbestimmt" style="margin-bottom: 12px;"></div>
    <p class="meta" role="status">${CRAWL_BADGE} · Der erste Crawl-Lauf ist gestartet.
    Die Seite aktualisiert sich automatisch, sobald er fertig ist.</p>`
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
    { aktiv: 'gebiete', kopfExtra: refreshBeiCrawl(crawlLaeuft, gebiet.id) },
  );
}

export interface GebietSeitenDaten {
  /** Datum des letzten erfolgreichen Laufs = Stand des Aktiv-Snapshots. */
  stichtag: string;
  /** Abschluss-Zeitpunkt dieses Laufs – „Zuletzt gecrawlt" im Kopf. */
  beendetAm: Date;
  trend: TrendPunkt[];
  vermarktung: { kauf: VermarktungsStatistik | null; miete: VermarktungsStatistik | null };
  /** Am Stichtag aktive Inserate (Kriterien-gefiltert). */
  aktive: BestandInserat[];
  /** Kürzlich delistete Inserate (Fenster siehe Server), jüngste zuerst. */
  delistete: BestandInserat[];
  /** Fenster der Delistet-Tabelle in Tagen (für die Überschrift). */
  delistetFensterTage: number;
  /** Letzte Preisänderung je Inserat (Schlüssel siehe inseratSchluessel). */
  aenderungen: Map<string, PreisAenderung>;
  /** true = ?inserate=alle, Tabellen ohne Zeilen-Cap rendern. */
  alleAnzeigen: boolean;
  laeufe: CrawlLauf[];
  /** Delistete gesamt (alle Zeiträume) – Kennzahl-Kachel. */
  anzahlDelisted: number;
}

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

/** Zeilen-Caps: Bestand-Tabellen bleiben lesbar, „alle anzeigen" hebt sie auf. */
const MAX_AKTIVE_ZEILEN = 50;
const MAX_DELISTET_ZEILEN = 30;

function vermarktungsWert(s: VermarktungsStatistik | null): string {
  if (!s) return '–';
  return `${nfTage.format(s.medianTage)} Tage`;
}

function vermarktungsSub(s: VermarktungsStatistik | null): string {
  if (!s) return 'noch keine delisteten Inserate';
  return `Median aus ${s.anzahl} delisteten Inseraten (Ø ${nfTage.format(s.meanTage)} Tage)`;
}

function inseratZelle(i: BestandInserat): string {
  const titel = `${i.ort} · ${nfEur0.format(i.zimmer)} Zi.`;
  const link = i.url ? `<a href="${escapeHtml(i.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
  return `<td>${link}<span class="sub">${i.typ === 'kauf' ? 'Kauf' : 'Miete'} · ${escapeHtml(i.id)}</span></td>`;
}

/** €/m² – Kauf ganzzahlig, Miete mit 2 Nachkommastellen (wie die Chart-Achsen). */
function eurM2Wert(i: BestandInserat): string {
  if (i.flaeche_m2 <= 0) return '–';
  const wert = i.preis / i.flaeche_m2;
  return i.typ === 'kauf' ? nfEur0.format(wert) : nfEur2.format(wert);
}

function aenderungsZelle(a: PreisAenderung | undefined): string {
  if (!a || a.neuerPreis === a.alterPreis) return '<td class="num meta">–</td>';
  const delta = a.neuerPreis - a.alterPreis;
  const prozent = (Math.abs(delta) / a.alterPreis) * 100;
  // Käufer-Perspektive: Senkung = Chance (grün), Erhöhung = kritisch. Das
  // Vorzeichen trägt das Urteil auch ohne Farbe.
  const klasse = delta < 0 ? 'gesenkt' : 'gestiegen';
  const zeichen = delta < 0 ? '−' : '+';
  return `<td class="num"><span class="${klasse}">${zeichen}${nfPct.format(prozent)} % (${zeichen}${nfEur0.format(Math.abs(delta))} €)</span><span class="sub">${escapeHtml(datumMedium(a.geaendertAm))}</span></td>`;
}

/** Aufsteigend nach €/m² – günstigster Quadratmeterpreis zuerst; ohne Fläche ans Ende. */
function nachEurM2(inserate: BestandInserat[]): BestandInserat[] {
  return [...inserate].sort((a, b) => {
    const ea = a.flaeche_m2 > 0 ? a.preis / a.flaeche_m2 : Infinity;
    const eb = b.flaeche_m2 > 0 ? b.preis / b.flaeche_m2 : Infinity;
    return ea - eb;
  });
}

function aktiveTabelle(
  inserate: BestandInserat[],
  aenderungen: Map<string, PreisAenderung>,
  stichtag: string,
): string {
  const zeilen = inserate
    .map((i) => {
      const tageOnline = Math.max(0, tageZwischen(i.zuerstGesehen, stichtag));
      return `      <tr>
        ${inseratZelle(i)}
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${nfEur0.format(i.flaeche_m2)} m²</td>
        <td class="num">${eurM2Wert(i)}</td>
        <td>${escapeHtml(datumMedium(i.zuerstGesehen))}<span class="sub">${nfTage.format(tageOnline)} Tage online</span></td>
        ${aenderungsZelle(aenderungen.get(inseratSchluessel(i.portal, i.id)))}
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th><th scope="col">zuerst gesehen</th><th scope="col" class="num">letzte Preisänderung</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function aktiveSektion(gebiet: Gebiet, daten: GebietSeitenDaten): string {
  const gruppen =
    gebiet.kriterien.typ === 'beide'
      ? [
          { titel: 'Kauf', inserate: daten.aktive.filter((i) => i.typ === 'kauf') },
          { titel: 'Miete', inserate: daten.aktive.filter((i) => i.typ === 'miete') },
        ]
      : [{ titel: undefined, inserate: daten.aktive }];

  let gekuerzt = 0;
  const bloecke = gruppen.map((g) => {
    const kopf = g.titel ? `    <h3 class="unterkopf">${g.titel}</h3>\n` : '';
    if (g.inserate.length === 0) {
      const leer = g.titel
        ? `Keine aktiven ${g.titel === 'Kauf' ? 'Kauf' : 'Miet'}-Inserate im Bestand.`
        : 'Keine aktiven Inserate im Bestand.';
      return `${kopf}    <p class="meta">${leer}</p>`;
    }
    const sortiert = nachEurM2(g.inserate);
    const sichtbar = daten.alleAnzeigen ? sortiert : sortiert.slice(0, MAX_AKTIVE_ZEILEN);
    gekuerzt += sortiert.length - sichtbar.length;
    return kopf + aktiveTabelle(sichtbar, daten.aenderungen, daten.stichtag);
  });

  const mehr =
    gekuerzt > 0
      ? `\n    <p class="meta"><a href="/gebiete/${gebiet.id}?inserate=alle">Alle ${daten.aktive.length} Inserate anzeigen →</a></p>`
      : '';
  return bloecke.join('\n') + mehr;
}

function delisteteSektion(daten: GebietSeitenDaten): string {
  if (daten.delistete.length === 0) {
    return `    <p class="meta">Keine Delistings in den letzten ${daten.delistetFensterTage} Tagen.</p>`;
  }
  const sortiert = [...daten.delistete].sort((a, b) =>
    b.zuletztGesehen.localeCompare(a.zuletztGesehen),
  );
  const sichtbar = daten.alleAnzeigen ? sortiert : sortiert.slice(0, MAX_DELISTET_ZEILEN);
  const zeilen = sichtbar
    .map(
      (i) => `      <tr>
        ${inseratZelle(i)}
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${eurM2Wert(i)}</td>
        <td>${escapeHtml(datumMedium(i.zuerstGesehen))} – ${escapeHtml(datumMedium(i.zuletztGesehen))}</td>
        <td class="num">${nfTage.format(tageZwischen(i.zuerstGesehen, i.zuletztGesehen))}</td>
      </tr>`,
    )
    .join('\n');
  const rest = sortiert.length - sichtbar.length;
  const hinweis =
    rest > 0 ? `\n    <p class="meta">… und ${rest} weitere in diesem Zeitraum.</p>` : '';
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">letzter Preis</th><th scope="col" class="num">€/m²</th><th scope="col">online von–bis</th><th scope="col" class="num">Tage</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>${hinweis}`;
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
  .gestiegen { color: var(--status-critical); font-weight: 600; }
  .unterkopf { font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
  .kopf-aktionen { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .kopf-aktionen p { margin: 0; }
`;

/** Auswertungsseite eines Gebiets: Kacheln, Trend-Charts, Inseratsbestand, Läufe. */
export function renderGebietSeite(
  gebiet: Gebiet,
  daten: GebietSeitenDaten,
  crawlLaeuft = false,
): string {
  const trendJson = JSON.stringify(daten.trend).replace(/</g, '\\u003c'); // "</script>"-sicher

  const ueberfaelligMarker =
    gebiet.aktiv && istUeberfaellig(daten.beendetAm)
      ? ' <span class="ueberfaellig">· überfällig</span>'
      : '';

  const inhalt = `  <header>
    <h1>${escapeHtml(gebiet.name)}</h1>
    <p class="meta">${escapeHtml(kriterienZusammenfassung(gebiet.kriterien))} ·
    Zuletzt gecrawlt: ${escapeHtml(nfZeitpunkt.format(daten.beendetAm))}${ueberfaelligMarker}</p>
    <div class="kopf-aktionen">
      <p class="meta"><a href="/gebiete/${gebiet.id}/report">Aktueller Marktreport →</a></p>
      <form method="post" action="/gebiete/${gebiet.id}/aktualisieren">
        <button class="klein"${crawlLaeuft ? ' disabled' : ''}>Jetzt crawlen</button>
      </form>
      ${crawlLaeuft ? `<p role="status">${CRAWL_BADGE}</p>` : ''}
    </div>
    ${crawlLaeuft ? '<div class="fortschritt" role="progressbar" aria-label="Crawl läuft" aria-valuetext="unbestimmt" style="margin-top: 8px;"></div>' : ''}
  </header>

  <section>
    <div class="tiles">
      <div class="tile">
        <div class="tile-label">Aktive Inserate</div>
        <div class="tile-value">${daten.aktive.length}</div>
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
    <h2>Aktive Inserate</h2>
${aktiveSektion(gebiet, daten)}
  </section>

  <section>
    <h2>Kürzlich delistet (letzte ${daten.delistetFensterTage} Tage)</h2>
${delisteteSektion(daten)}
  </section>

  <section>
    <h2>Letzte Crawl-Läufe</h2>
${laeufeTabelle(daten.laeufe)}
  </section>

  <footer>
    <p><strong>Methodik:</strong> Aktiv = im letzten erfolgreichen Crawl-Lauf gesehen
      (Bestand, Stand ${escapeHtml(daten.stichtag)}); Delisting ist nur
      ein Proxy für verkauft/vermietet (Inserate können auch zurückgezogen worden sein).
      Vermarktungsdauer = zuletzt − zuerst gesehen; Inserate aus dem allerersten Crawl sind dabei
      nur begrenzt aussagekräftig („links-zensiert“: sie waren evtl. schon vor dem ersten Crawl online).
      Trend: Median €/m² der am Stichtag aktiven Inserate, Wochenraster, Preise aus der
      Preishistorie rekonstruiert. Preisänderungen: letzte Änderung laut Preishistorie (tagesgenau).</p>
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
  // Reduzierte Bewegung → keine Chart-Einblend-Animation. Sonst ein kurzer,
  // ruhiger Fade (300 ms ease-out) beim ersten Zeichnen – lang genug, dass die
  // Linie „gefunden" wirkt, kurz genug, dass niemand darauf wartet. Beim
  // Theme-Wechsel (renderAll erneut) wird die Animation unterdrückt, sonst
  // würde jedes Umschalten Licht/Dunkel eine neue Animation auslösen.
  const reduziert = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let charts = [];
  let ersterZeichnung = true;

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
        animation: reduziert || !ersterZeichnung ? false : { duration: 300, easing: 'easeOutQuart' },
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
    ersterZeichnung = false;
  }

  renderAll();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);
})();
</script>`;

  return seite(gebiet.name, inhalt, {
    breite: 'breit',
    aktiv: 'gebiete',
    extraCss: GEBIET_CSS + FRISCHE_CSS,
    kopfExtra: refreshBeiCrawl(crawlLaeuft, gebiet.id),
  });
}
