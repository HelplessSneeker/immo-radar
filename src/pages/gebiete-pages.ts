import { analyze } from '../analyze.js';
import type { BestandInserat } from '../db/bestand-repo.js';
import type { CrawlLauf, FertigerLauf, Gebiet } from '../db/gebiete-repo.js';
import { tageZwischen } from '../datum.js';
import { renderReport, ZIEL_RENDITE } from '../report.js';
import {
  inseratSchluessel,
  type PreisAenderung,
  type RenditeKennzahl,
  type TrendPunkt,
  type VermarktungsStatistik,
} from '../trend.js';
import {
  aenderungsZelle,
  datumMedium,
  eurM2Wert,
  fmtRendite,
  inseratZelle,
  nachEurM2,
  nfEur0,
  nfPct,
  nfTage,
  nfZeit,
  nfZeitpunkt,
} from './format.js';
import { escapeHtml, FORMULAR_CSS, seite } from './layout.js';
import { bereichsPruefungJs, formFehlerBlock, kriterienFelder, type FormFehler } from './search-page.js';
import { kriterienZusammenfassung, STATUS_TEXT } from './suchen-pages.js';

/** Verwaltungs- und Auswertungsseiten der Beobachtungsgebiete (Watchlist). */

export const CRAWL_BADGE = '<span class="status-badge status-laufend">Crawl läuft</span>';

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
 * Die Übersicht rendert breit (die Tabelle trägt inzwischen sechs Spalten),
 * aber das Anlege-Formular bleibt in Lesebreite – Formularfelder über 1080px
 * wären unbedienbar lang.
 */
const UEBERSICHT_CSS = `
  #gebietform { max-width: 560px; }
  #gebiete-tabelle td:first-child { min-width: 180px; }
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
export function refreshBeiCrawl(crawlLaeuft: boolean, gebietId: number): string {
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

/** Kennzahlen eines Gebiets für die Übersichts-Tabelle (fehlt ohne fertigen Lauf). */
export interface GebietKennzahlen {
  aktive: number;
  aktiveKauf: number;
  aktiveMiete: number;
  /** Median-€/m²-Bewegung der Leit-Serie ggü. der Vorwoche; null bei < 2 Trendpunkten. */
  tendenz: { serie: 'kauf' | 'miete'; deltaProzent: number } | null;
}

/** Unterhalb dieser Bewegung (±%) gilt der Wochen-Median als stabil. */
const TENDENZ_STABIL_PROZENT = 0.5;

function aktiveZelle(g: Gebiet, k: GebietKennzahlen | undefined): string {
  if (!k) return '<td class="num meta">–</td>';
  const sub =
    g.kriterien.typ === 'beide'
      ? `<span class="sub">${k.aktiveKauf} Kauf · ${k.aktiveMiete} Miete</span>`
      : '';
  return `<td class="num">${k.aktive}${sub}</td>`;
}

/**
 * Marktrichtung ist ein neutraler Fakt, kein Urteil – deshalb Tintenfarbe
 * (Urteils-Regel); Pfeil und Vorzeichen tragen die Richtung auch ohne Farbe.
 */
function tendenzZelle(k: GebietKennzahlen | undefined): string {
  if (!k || !k.tendenz) return '<td class="num meta">–</td>';
  const { serie, deltaProzent } = k.tendenz;
  const serieName = serie === 'kauf' ? 'Kauf' : 'Miete';
  const sub = `<span class="sub">${serieName}, ggü. Vorwoche</span>`;
  if (Math.abs(deltaProzent) < TENDENZ_STABIL_PROZENT) {
    return `<td class="num">→ stabil${sub}</td>`;
  }
  const pfeil = deltaProzent > 0 ? '▲' : '▼';
  const zeichen = deltaProzent > 0 ? '+' : '−';
  return `<td class="num">${pfeil} ${zeichen}${nfPct.format(Math.abs(deltaProzent))} %${sub}</td>`;
}

function gebieteTabelle(
  gebiete: Gebiet[],
  laufende: Set<number>,
  letzteLaeufe: Map<number, FertigerLauf>,
  kennzahlen: Map<number, GebietKennzahlen>,
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
        <td><a href="/gebiete/${g.id}">${escapeHtml(g.name)}</a><span class="sub">${escapeHtml(kriterienZusammenfassung(g.kriterien))}</span></td>
        ${aktiveZelle(g, kennzahlen.get(g.id))}
        ${tendenzZelle(kennzahlen.get(g.id))}
        ${zuletztGecrawltZelle(g, letzteLaeufe.get(g.id)?.beendetAm)}
        <td class="status-zelle">${status}</td>
        <td><div class="aktionen">${crawlen}${schalter}${loeschen}</div></td>
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table class="historie" id="gebiete-tabelle">
      <thead><tr><th scope="col">Gebiet</th><th scope="col" class="num">Aktive Inserate</th><th scope="col" class="num">Tendenz €/m²</th><th scope="col">Zuletzt gecrawlt</th><th scope="col">Status</th><th scope="col"><span class="sr-nur">Aktionen</span></th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

export function renderGebieteSeite(
  gebiete: Gebiet[],
  laufende: Set<number>,
  letzteLaeufe: Map<number, FertigerLauf>,
  kennzahlen: Map<number, GebietKennzahlen>,
  fehler?: FormFehler,
): string {
  const liste =
    gebiete.length === 0
      ? `    <p><strong>So funktioniert es:</strong> 1. Unten ein Gebiet mit Kriterien anlegen.
    2. immo-radar crawlt es einmal täglich auf willhaben.at und immoscout24.at.
    3. Nach den ersten Läufen entstehen Preisverlauf, Vermarktungsdauer und Bruttorendite –
    je Gebiet auf seiner Detailseite.</p>`
      : gebieteTabelle(gebiete, laufende, letzteLaeufe, kennzahlen);
  const nameWert = fehler?.werte.get('name')?.trim();

  return seite(
    'Beobachtungsgebiete',
    `  <header>
    <h1>Beobachtungsgebiete</h1>
    <p class="meta">Beobachtungsgebiete verfolgen Kauf- und Mietpreise vergleichbarer Wohnungen
    über die Zeit – aktive Gebiete werden einmal täglich gecrawlt und bauen den historisierten
    Inseratsbestand auf (Preisverlauf je Inserat, Vermarktungsdauer, Trends).</p>
    <p class="meta"><a href="/gebiete/report">Portfolio-Marktreport →</a></p>
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
    { aktiv: 'gebiete', breite: 'breit', extraCss: FORMULAR_CSS + FRISCHE_CSS + UEBERSICHT_CSS },
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

/** Datengrundlage eines Gebiets für den Portfolio-Marktreport. */
export interface PortfolioGebietDaten {
  gebiet: Gebiet;
  /** laufDatum des letzten fertigen Laufs; undefined = noch keiner. */
  stichtag?: string;
  /** Am Stichtag aktive Inserate (Kriterien-gefiltert); leer ohne Lauf. */
  aktive: BestandInserat[];
}

/**
 * Marktreport über alle aktiven Gebiete: ein Report, gruppiert nach
 * Gebiet-Name statt Ort – so mischt ein Bundesland-Gebiet seine Orte nicht
 * mit dem Einzelort-Gebiet daneben. Jedes Gebiet hat seinen eigenen Stichtag
 * (letzter fertiger Lauf); die Quellen-Zeilen machen das transparent.
 */
export function renderPortfolioReport(teile: PortfolioGebietDaten[]): string {
  // Namenskollisionen eindeutig machen – sonst verschmelzen zwei Gebiete zu
  // einer Gruppe (bzw. wirft analyze bei überlappenden Inseraten).
  const namensZaehler = new Map<string, number>();
  for (const t of teile) {
    namensZaehler.set(t.gebiet.name, (namensZaehler.get(t.gebiet.name) ?? 0) + 1);
  }
  const label = (gebiet: Gebiet) =>
    (namensZaehler.get(gebiet.name) ?? 0) > 1 ? `${gebiet.name} (Gebiet ${gebiet.id})` : gebiet.name;

  const quellen = teile.map((t) =>
    t.stichtag === undefined
      ? `${label(t.gebiet)}: noch kein fertiger Crawl-Lauf`
      : `${label(t.gebiet)}: Bestand, Stand ${t.stichtag} (${t.aktive.length} aktive Inserate)`,
  );

  type PortfolioInserat = BestandInserat & { gebietName: string };
  const getaggt: PortfolioInserat[] = teile.flatMap((t) =>
    t.aktive.map((i) => ({ ...i, gebietName: label(t.gebiet) })),
  );
  if (getaggt.length === 0) return renderPortfolioLeerSeite(quellen);

  const stichtage = teile.map((t) => t.stichtag).filter((s): s is string => s !== undefined);
  return renderReport(
    analyze(getaggt, (i) => i.gebietName),
    {
      quellen,
      erstellt: stichtage.reduce((a, b) => (a >= b ? a : b)),
      region: 'Portfolio',
      navAktiv: 'gebiete',
      zurueck: { href: '/', label: '← Zurück zu den Beobachtungsgebieten' },
    },
  );
}

/** Leerzustand des Portfolio-Reports – freundlicher Hinweis statt 404. */
function renderPortfolioLeerSeite(hinweise: string[]): string {
  const stand =
    hinweise.length === 0
      ? `    <p class="meta">Noch keine Daten – lege ein Beobachtungsgebiet an und warte auf
    den ersten Crawl.</p>`
      : `    <p class="meta">Noch keine auswertbaren Inserate – die Gebiete warten auf ihren
    ersten fertigen Crawl-Lauf.</p>
    <ul class="meta">
${hinweise.map((h) => `      <li>${escapeHtml(h)}</li>`).join('\n')}
    </ul>`;
  return seite(
    'Portfolio-Marktreport',
    `  <header><h1>Portfolio-Marktreport</h1></header>
  <section>
${stand}
    <p class="meta"><a href="/">Zur Gebiete-Übersicht →</a></p>
  </section>`,
    { aktiv: 'gebiete' },
  );
}

/** Veränderungs-Zähler eines fertigen Laufs für die Läufe-Tabelle. */
export interface LaufVeraenderungen {
  neu: number;
  delistet: number;
  preise: number;
}

export interface GebietSeitenDaten {
  /** Datum des letzten erfolgreichen Laufs = Stand des Aktiv-Snapshots. */
  stichtag: string;
  /** Abschluss-Zeitpunkt dieses Laufs – „Zuletzt gecrawlt" im Kopf. */
  beendetAm: Date;
  trend: TrendPunkt[];
  vermarktung: { kauf: VermarktungsStatistik | null; miete: VermarktungsStatistik | null };
  /** Bruttorendite der aktiven Inserate; null, wenn ein Typ fehlt. */
  rendite: RenditeKennzahl | null;
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
  /**
   * Veränderungs-Zähler je Lauf-ID (nur fertige Läufe mit bekanntem
   * Vorgänger-Fenster – fehlende Einträge rendern als „–").
   */
  laufVeraenderungen: Map<number, LaufVeraenderungen>;
  /** Delistete gesamt (alle Zeiträume) – Kennzahl-Kachel. */
  anzahlDelisted: number;
}

const CHART_JS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

/** Zeilen-Caps: Bestand-Tabellen bleiben lesbar, „alle anzeigen" hebt sie auf. */
const MAX_AKTIVE_ZEILEN = 50;
const MAX_DELISTET_ZEILEN = 30;

/**
 * Bruttorendite-Kachel – das Urteil zuerst (Kachel-Reihenfolge). Nur für
 * Gebiete mit typ=beide: die Kennzahl vergleicht Miet- und Kauf-Markt und
 * ist ohne eine der beiden Seiten nicht anwendbar (dann keine Kachel statt
 * Dauerstrich). Fehlen bei typ=beide die Daten eines Typs, sagt die Kachel
 * das ehrlich, statt still zu verschwinden.
 */
function renditeKachel(gebiet: Gebiet, rendite: RenditeKennzahl | null): string {
  if (gebiet.kriterien.typ !== 'beide') return '';
  if (!rendite) {
    return `      <div class="tile">
        <div class="tile-label">Bruttorendite</div>
        <div class="tile-value">–</div>
        <div class="tile-sub">keine Kauf- oder Miet-Daten im aktiven Bestand</div>
      </div>
`;
  }
  const erreicht = rendite.brutto >= ZIEL_RENDITE;
  const badge = erreicht
    ? '<div class="tile-badge tile-badge-good">✓ Ziel ≥ 4 % erreicht</div>'
    : '<div class="tile-badge">unter 4 %-Ziel</div>';
  return `      <div class="tile${erreicht ? ' tile-good' : ''}">
        <div class="tile-label">Bruttorendite</div>
        <div class="tile-value">${escapeHtml(fmtRendite(rendite.brutto))}</div>
        ${badge}
        <div class="tile-sub">Median-Miete ×12 ÷ Median-Kaufpreis, je €/m²
        (${rendite.anzahlKauf} Kauf-, ${rendite.anzahlMiete} Miet-Inserate)</div>
      </div>
`;
}

function vermarktungsWert(s: VermarktungsStatistik | null): string {
  if (!s) return '–';
  return `${nfTage.format(s.medianTage)} Tage`;
}

function vermarktungsSub(s: VermarktungsStatistik | null): string {
  if (!s) return 'noch keine delisteten Inserate';
  return `Median aus ${s.anzahl} delisteten Inseraten (Ø ${nfTage.format(s.meanTage)} Tage)`;
}

function aktiveTabelle(
  inserate: BestandInserat[],
  aenderungen: Map<string, PreisAenderung>,
  stichtag: string,
): string {
  const zeilen = inserate
    .map((i) => {
      const tageOnline = Math.max(0, tageZwischen(i.zuerstGesehen, stichtag));
      // Bei aktiven Inseraten ist zuletztGesehen normalerweise der Stichtag –
      // die Sonderdarstellung hält die Spalte informativ statt redundant.
      const zuletzt =
        i.zuletztGesehen === stichtag
          ? 'heute (Stichtag)'
          : escapeHtml(datumMedium(i.zuletztGesehen));
      return `      <tr>
        ${inseratZelle(i)}
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${nfEur0.format(i.flaeche_m2)} m²</td>
        <td class="num">${eurM2Wert(i)}</td>
        <td>${escapeHtml(datumMedium(i.zuerstGesehen))}<span class="sub">${nfTage.format(tageOnline)} Tage online</span></td>
        <td>${zuletzt}</td>
        ${aenderungsZelle(aenderungen.get(inseratSchluessel(i.portal, i.id)))}
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th><th scope="col">zuerst gesehen</th><th scope="col">zuletzt gesehen</th><th scope="col" class="num">letzte Preisänderung</th></tr></thead>
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

/** Kompakter Veränderungs-Text einer Lauf-Zeile, z. B. „5 neu · 2 delistet · 1 Preis". */
function veraenderungsZelle(v: LaufVeraenderungen | undefined): string {
  if (!v) return '<td class="meta">–</td>';
  if (v.neu === 0 && v.delistet === 0 && v.preise === 0) {
    return '<td class="meta">keine</td>';
  }
  const teile = [
    `${v.neu} neu`,
    `${v.delistet} delistet`,
    `${v.preise} ${v.preise === 1 ? 'Preis' : 'Preise'}`,
  ];
  return `<td>${teile.join(' · ')}</td>`;
}

/**
 * Fertiger Lauf, bei dem mindestens ein Portal ausgefallen ist – der Lauf
 * bleibt dann "fertig", die Zahlen sind aber unvollständig. Erkennt die
 * Quellen-Zeile aus crawlePortale (suchlauf.ts, "… nicht abfragbar (…)").
 */
export function hatPortalAusfall(lauf: Pick<CrawlLauf, 'status' | 'quellen'>): boolean {
  return lauf.status === 'fertig' && lauf.quellen.some((q) => q.includes('nicht abfragbar'));
}

function laeufeTabelle(
  gebiet: Gebiet,
  laeufe: CrawlLauf[],
  veraenderungen: Map<number, LaufVeraenderungen>,
): string {
  const zeilen = laeufe
    .map(
      (l) => `      <tr>
        <td><a href="/gebiete/${gebiet.id}/laeufe/${l.id}">${escapeHtml(datumMedium(l.laufDatum))}</a></td>
        <td><span class="status-badge status-${l.status}">${STATUS_TEXT[l.status]}</span>${
          hatPortalAusfall(l)
            ? ' <span class="ueberfaellig" title="Mindestens ein Portal war nicht abfragbar – die Zahlen dieses Laufs sind unvollständig.">· Portal-Ausfall</span>'
            : ''
        }</td>
        <td class="num">${l.inserateGesehen ?? ''}</td>
        ${veraenderungsZelle(veraenderungen.get(l.id))}
        <td class="meta">${l.fehler ? escapeHtml(l.fehler) : escapeHtml(l.quellen.join(' · '))}</td>
      </tr>`,
    )
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Tag</th><th scope="col">Status</th><th scope="col" class="num">Inserate</th><th scope="col">Veränderungen</th><th scope="col">Quellen / Fehler</th></tr></thead>
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
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px; }
  .tile { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
  .tile-good { background: var(--good-bg); }
  .tile-label { color: var(--text-secondary); font-size: 13px; }
  .tile-value { font-size: 30px; font-weight: 600; margin: 2px 0 6px; }
  .tile-badge { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
  .tile-badge-good { color: var(--good-text); font-weight: 600; }
  .tile-sub { font-size: 12px; color: var(--text-secondary); }
  .charts-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
  .chart-box { min-width: 0; }
  .chart-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .chart-wrap { position: relative; height: 260px; }
  .unterkopf { font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
  .kopf-aktionen { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .kopf-aktionen p { margin: 0; }
  .klapp-sektion > summary { cursor: pointer; }
  .klapp-sektion > summary h2 { display: inline; margin: 0; }
  .klapp-sektion[open] > summary { margin-bottom: 12px; }
  /* Druck: zugeklappte Sektionen best-effort aufklappen (Chromium 131+);
     ältere Engines drucken zugeklappt – ?inserate=alle rendert offen. */
  @media print { .klapp-sektion::details-content { content-visibility: visible; } }
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
      <form method="post" action="/gebiete/${gebiet.id}/aktualisieren">
        <button class="klein"${crawlLaeuft ? ' disabled' : ''}>Jetzt crawlen</button>
      </form>
      ${crawlLaeuft ? `<p role="status">${CRAWL_BADGE}</p>` : ''}
    </div>
    ${crawlLaeuft ? '<div class="fortschritt" role="progressbar" aria-label="Crawl läuft" aria-valuetext="unbestimmt" style="margin-top: 8px;"></div>' : ''}
  </header>

  <section>
    <div class="tiles">
${renditeKachel(gebiet, daten.rendite)}      <div class="tile">
        <div class="tile-label">Aktive Inserate</div>
        <div class="tile-value">${daten.aktive.length}</div>
        <div class="tile-sub">im letzten Crawl gesehen (Stand ${escapeHtml(datumMedium(daten.stichtag))})</div>
      </div>
      <div class="tile">
        <div class="tile-label">Delistet</div>
        <div class="tile-value">${daten.anzahlDelisted}</div>
        <div class="tile-sub">vermutlich verkauft/vermietet – ein Näherungswert</div>
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
    <p class="meta" style="margin-bottom: 0;">Alle Kennzahlen erklärt → <a href="/methodik">Methodik</a></p>
  </section>

  <section>
    <h2>Median €/m² über die Zeit</h2>
    <p class="meta">Wochenraster; Median der am Stichtag aktiven Inserate, Preise aus der
    Preishistorie. <a href="/methodik#median-trend">Details</a></p>
${trendSektion(daten.trend)}
  </section>

  <section>
    <details class="klapp-sektion"${daten.alleAnzeigen ? ' open' : ''}>
    <summary><h2>Aktive Inserate (${daten.aktive.length})</h2></summary>
    <p class="meta">Aktiv = im letzten erfolgreichen Lauf gesehen; €/m² = Preis ÷ Wohnfläche.
    <a href="/methodik#aktive-inserate">Details</a></p>
${aktiveSektion(gebiet, daten)}
    </details>
  </section>

  <section>
    <details class="klapp-sektion"${daten.alleAnzeigen ? ' open' : ''}>
    <summary><h2>Kürzlich delistet (${daten.delistete.length})</h2></summary>
    <p class="meta">Delistings der letzten ${daten.delistetFensterTage} Tage. Delisting ist ein
    Näherungswert für verkauft/vermietet – Inserate können
    auch zurückgezogen worden sein. <a href="/methodik#delistet">Details</a></p>
${delisteteSektion(daten)}
    </details>
  </section>

  <section>
    <h2>Letzte Crawl-Läufe</h2>
    <p class="meta">Jeder Tag verlinkt seine Veränderungen: neue Inserate, Delistings,
    Preisänderungen.</p>
${laeufeTabelle(gebiet, daten.laeufe, daten.laufVeraenderungen)}
  </section>

  <footer>
    <p><strong>Methodik:</strong> Stichtag aller Kennzahlen ist der letzte erfolgreiche
      Crawl-Lauf (${escapeHtml(datumMedium(daten.stichtag))}). Delisting bleibt ein Näherungswert –
      alle Formeln und Grenzen: <a href="/methodik">Methodik</a>.</p>
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
