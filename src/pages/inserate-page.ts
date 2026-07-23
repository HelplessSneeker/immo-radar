import type {
  BestandInseratMitLand,
  InserateFilter,
  InserateSortierung,
} from '../db/bestand-repo.js';
import type { DetailFacetten } from '../db/inserat-details-repo.js';
import { tageZwischen } from '../datum.js';
import { datenqualitaetLabels } from '../plausibilitaet.js';
import { BUNDESLAENDER } from '../search.js';
import { inseratSchluessel, type PreisAenderung } from '../trend.js';
import { aenderungsZelle, datumMedium, eurM2Wert, nfEur0, nfTage } from './format.js';
import { escapeHtml, seite } from './layout.js';
import { filterLeiste } from './ui/filter.js';
import { checkboxFeld, detailsFacette, selectFeld, textFeld, vonBisFeld } from './ui/formular.js';
import { html, join, LEER, raw, type Html } from './ui/html.js';
import { seitenNav as seitenNavigation } from './ui/navigation.js';

/**
 * Der globale Inseratsbestand als paginierte, filterbare Tabelle – die
 * Rohdaten-Sicht hinter allen Gebiets-Auswertungen. Filter und Seite sind
 * GET-Parameter (teilbare Links, kein JS nötig).
 */

export interface InserateSeitenDaten {
  inserate: BestandInseratMitLand[];
  /** Gesamtzahl der Treffer für die aktuellen Filter (nicht nur diese Seite). */
  gesamt: number;
  /** 1-basiert. */
  seite: number;
  proSeite: number;
  filter: InserateFilter;
  sortierung: InserateSortierung;
  /** Anwählbare Werte der Detail-Facetten; leere Listen blenden die Felder aus. */
  facetten: DetailFacetten;
  /** Letzte Preisänderung je Inserat (Schlüssel siehe inseratSchluessel). */
  aenderungen: Map<string, PreisAenderung>;
}

const SORTIERUNG_LABELS: Record<InserateSortierung, string> = {
  zuletzt_gesehen: 'zuletzt gesehen (neueste zuerst)',
  zuerst_gesehen: 'zuerst gesehen (neueste zuerst)',
  preis: 'Preis (aufsteigend)',
  eur_m2: '€/m² (aufsteigend)',
  flaeche: 'Fläche (größte zuerst)',
};

/** URL der Bestand-Seite; Defaults (Seite 1, Standard-Sortierung) bleiben weg. */
function inserateUrl(
  filter: InserateFilter,
  sortierung: InserateSortierung,
  seiteNr: number,
): string {
  const params = new URLSearchParams();
  if (filter.bundesland) params.set('bundesland', filter.bundesland);
  if (filter.typ) params.set('typ', filter.typ);
  if (filter.status) params.set('status', filter.status);
  if (filter.ort) params.set('ort', filter.ort);
  if (filter.nurAusreisser) params.set('nur', 'ausreisser');
  if (filter.zimmerMin !== undefined) params.set('zimmer_min', String(filter.zimmerMin));
  if (filter.zimmerMax !== undefined) params.set('zimmer_max', String(filter.zimmerMax));
  if (filter.baujahrMin !== undefined) params.set('baujahr_min', String(filter.baujahrMin));
  if (filter.baujahrMax !== undefined) params.set('baujahr_max', String(filter.baujahrMax));
  if (filter.heizung) params.set('heizung', filter.heizung);
  if (filter.zustand) params.set('zustand', filter.zustand);
  if (filter.baustil) params.set('baustil', filter.baustil);
  for (const wert of filter.ausstattung ?? []) params.append('ausstattung', wert);
  if (sortierung !== 'zuletzt_gesehen') params.set('sortierung', sortierung);
  if (seiteNr > 1) params.set('seite', String(seiteNr));
  const query = params.toString();
  return query ? `/inserate?${query}` : '/inserate';
}

function filterGesetzt(daten: InserateSeitenDaten): boolean {
  const f = daten.filter;
  return Boolean(
    f.bundesland ||
      f.typ ||
      f.status ||
      f.ort ||
      f.nurAusreisser ||
      f.zimmerMin !== undefined ||
      f.zimmerMax !== undefined ||
      f.baujahrMin !== undefined ||
      f.baujahrMax !== undefined ||
      f.heizung ||
      f.zustand ||
      f.baustil ||
      f.ausstattung !== undefined ||
      daten.sortierung !== 'zuletzt_gesehen',
  );
}

/**
 * Select einer Detail-Facette; ohne Optionen (frische DB ohne Details) fällt
 * das Feld weg (LEER überspringt die filterLeiste). Ein aktiver Wert außerhalb
 * der Optionen (handgebaute URL) wird mit angeboten — sonst verlöre das
 * Formular den Filter beim Neu-Absenden.
 */
function facettenFeld(
  name: 'heizung' | 'zustand' | 'baustil',
  label: string,
  alleLabel: string,
  werte: string[],
  aktiv: string | undefined,
): Html {
  if (werte.length === 0 && !aktiv) return LEER;
  const alleWerte = aktiv && !werte.includes(aktiv) ? [...werte, aktiv] : werte;
  return selectFeld({
    id: `f-${name}`,
    name,
    label,
    optionen: [['', alleLabel], ...alleWerte.map((w) => [w, w] as const)],
    ausgewaehlt: aktiv,
  });
}

/**
 * Mehrfach-Facette Ausstattung (wiederholter GET-Param) als zugeklapptes
 * natives <details> — gleiche Affordance wie die zusammenklappbare
 * Dashboard-Filterleiste: die Summary nennt den Zustand („Ausstattung:
 * 2 gewählt"), eine aktive Auswahl öffnet das Panel.
 */
function ausstattungFeld(werte: string[], aktiv: string[] | undefined): Html {
  const alleWerte = [...werte, ...(aktiv ?? []).filter((w) => !werte.includes(w))];
  if (alleWerte.length === 0) return LEER;
  const gewaehlt = aktiv?.length ?? 0;
  const boxen = join(
    alleWerte.map(
      (w) =>
        html`<label><input type="checkbox" name="ausstattung" value="${w}"${
          aktiv?.includes(w) ? raw(' checked') : LEER
        }> ${w}</label>`,
    ),
    '\n          ',
  );
  return detailsFacette({
    summary: `Ausstattung${gewaehlt > 0 ? `: ${gewaehlt} gewählt` : ''}`,
    offen: gewaehlt > 0,
    inhalt: html`<div class="facetten-panel">
          ${boxen}
        </div>`,
  });
}

function filterleiste(daten: InserateSeitenDaten): string {
  return filterLeiste({
    aktion: '/inserate',
    felder: [
      selectFeld({
        id: 'f-bundesland',
        name: 'bundesland',
        label: 'Bundesland',
        optionen: [['', 'alle Bundesländer'], ...Object.entries(BUNDESLAENDER)],
        ausgewaehlt: daten.filter.bundesland,
      }),
      selectFeld({
        id: 'f-typ',
        name: 'typ',
        label: 'Typ',
        optionen: [
          ['', 'Kauf & Miete'],
          ['kauf', 'Kauf'],
          ['miete', 'Miete'],
        ],
        ausgewaehlt: daten.filter.typ,
      }),
      selectFeld({
        id: 'f-status',
        name: 'status',
        label: 'Status',
        optionen: [
          ['', 'aktiv & delistet'],
          ['aktiv', 'aktiv'],
          ['delistet', 'delistet'],
        ],
        ausgewaehlt: daten.filter.status,
      }),
      textFeld({
        id: 'f-ort',
        name: 'ort',
        label: 'Ort / PLZ / Bezirk',
        wert: daten.filter.ort ?? '',
        platzhalter: 'z. B. Villach',
      }),
      vonBisFeld({
        legend: 'Zimmer',
        klasse: 'feld-zimmer',
        von: {
          id: 'f-zimmer-min',
          name: 'zimmer_min',
          inputmode: 'decimal',
          wert: daten.filter.zimmerMin,
          platzhalter: 'von',
          ariaLabel: 'Zimmer von',
        },
        bis: {
          id: 'f-zimmer-max',
          name: 'zimmer_max',
          inputmode: 'decimal',
          wert: daten.filter.zimmerMax,
          platzhalter: 'bis',
          ariaLabel: 'Zimmer bis',
        },
      }),
      vonBisFeld({
        legend: 'Baujahr',
        klasse: 'feld-baujahr',
        von: {
          id: 'f-baujahr-min',
          name: 'baujahr_min',
          inputmode: 'numeric',
          wert: daten.filter.baujahrMin,
          platzhalter: 'von',
          ariaLabel: 'Baujahr von',
        },
        bis: {
          id: 'f-baujahr-max',
          name: 'baujahr_max',
          inputmode: 'numeric',
          wert: daten.filter.baujahrMax,
          platzhalter: 'bis',
          ariaLabel: 'Baujahr bis',
        },
      }),
      facettenFeld('heizung', 'Heizung', 'alle Heizungen', daten.facetten.heizung, daten.filter.heizung),
      facettenFeld('zustand', 'Zustand', 'alle Zustände', daten.facetten.zustand, daten.filter.zustand),
      facettenFeld('baustil', 'Baustil', 'alle Baustile', daten.facetten.baustil, daten.filter.baustil),
      ausstattungFeld(daten.facetten.ausstattung, daten.filter.ausstattung),
      selectFeld({
        id: 'f-sortierung',
        name: 'sortierung',
        label: 'Sortierung',
        optionen: Object.entries(SORTIERUNG_LABELS) as Array<[InserateSortierung, string]>,
        ausgewaehlt: daten.sortierung,
      }),
      checkboxFeld({
        name: 'nur',
        wert: 'ausreisser',
        label: 'Nur Ausreißer',
        checked: daten.filter.nurAusreisser === true,
        hinweis: html`<a href="/methodik#ausreisser">Was zählt als Ausreißer?</a>`,
      }),
    ],
    zuruecksetzenHref: filterGesetzt(daten) ? '/inserate' : undefined,
  });
}

function inseratZeile(i: BestandInseratMitLand, daten: InserateSeitenDaten): string {
  const titel = `${i.ort} · ${nfEur0.format(i.zimmer)} Zi.`;
  const link = i.url ? `<a href="${escapeHtml(i.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
  const land = BUNDESLAENDER[i.bundesland] ?? i.bundesland;
  // Manche Portale liefern als „Bezirk" nur das Bundesland – dann nicht doppeln.
  const region = i.bezirk === land ? `${escapeHtml(land)} (${escapeHtml(i.plz)})` : `${escapeHtml(i.bezirk)} (${escapeHtml(i.plz)}) · ${escapeHtml(land)}`;
  const sub = `${i.typ === 'kauf' ? 'Kauf' : 'Miete'} · ${escapeHtml(i.portal)} · ${region}`;
  const tage = Math.max(0, tageZwischen(i.zuerstGesehen, i.zuletztGesehen));
  const status = i.aktiv
    ? '<span class="status-badge status-aktiv">aktiv</span>'
    : '<span class="status-badge status-delistet">delistet</span>';
  // Die Grund-Spalte gibt es nur in der „Nur Ausreißer"-Sicht — sonst wären
  // fast alle Zellen leer.
  const grundZelle = daten.filter.nurAusreisser
    ? `\n        <td>${i.datenqualitaet !== undefined ? escapeHtml(datenqualitaetLabels(i.datenqualitaet)) : ''}</td>`
    : '';
  return `      <tr>
        <td>${link}<span class="sub">${sub}</span></td>
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${nfEur0.format(i.flaeche_m2)} m²</td>
        <td class="num">${eurM2Wert(i)}</td>${grundZelle}
        ${aenderungsZelle(daten.aenderungen.get(inseratSchluessel(i.portal, i.id)))}
        <td>${escapeHtml(datumMedium(i.zuerstGesehen))} – ${escapeHtml(datumMedium(i.zuletztGesehen))}<span class="sub">${nfTage.format(tage)} Tage</span></td>
        <td>${status}</td>
      </tr>`;
}

function tabelle(daten: InserateSeitenDaten): string {
  const zeilen = daten.inserate.map((i) => inseratZeile(i, daten)).join('\n');
  const grundKopf = daten.filter.nurAusreisser ? '<th scope="col">Ausreißer-Grund</th>' : '';
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th>${grundKopf}<th scope="col" class="num">letzte Preisänderung</th><th scope="col">gesehen</th><th scope="col">Status</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function seitenNav(daten: InserateSeitenDaten): string {
  const gesamtSeiten = Math.max(1, Math.ceil(daten.gesamt / daten.proSeite));
  if (gesamtSeiten <= 1) return '';
  const url = (zielSeite: number): string => inserateUrl(daten.filter, daten.sortierung, zielSeite);
  return seitenNavigation({
    label: 'Seiten',
    zaehler: `Seite ${nfEur0.format(daten.seite)} von ${nfEur0.format(gesamtSeiten)} · ${nfEur0.format(daten.gesamt)} Inserate`,
    zurueck: daten.seite > 1 ? { href: url(daten.seite - 1), text: '← Zurück' } : undefined,
    weiter: daten.seite < gesamtSeiten ? { href: url(daten.seite + 1), text: 'Weiter →' } : undefined,
  });
}

function inhaltOderLeer(daten: InserateSeitenDaten): string {
  if (daten.inserate.length > 0) {
    return `${tabelle(daten)}
${seitenNav(daten)}`;
  }
  if (daten.gesamt === 0 && !filterGesetzt(daten)) {
    return `    <p class="meta">Der Bestand ist leer – er füllt sich mit dem ersten täglichen
    Kärnten-Sweep. <a href="/crawl">Zu den Crawl-Läufen →</a></p>`;
  }
  const f = daten.filter;
  // "nur Ausreißer" ist der einzige gesetzte Filter — robust gegen künftige
  // Filter-Felder, statt jede Negation von Hand zu pflegen.
  const nurAusreisserAllein =
    f.nurAusreisser === true &&
    Object.entries(f).every(([schluessel, wert]) => schluessel === 'nurAusreisser' || wert === undefined);
  if (daten.gesamt === 0 && nurAusreisserAllein) {
    return `    <p class="meta">Keine Ausreißer im aktuellen Bestand — Datenqualität passt.
    <a href="/inserate">Alle Inserate ansehen →</a></p>`;
  }
  if (daten.gesamt === 0) {
    return `    <p class="meta">Keine Inserate für diese Filter.
    <a href="/inserate">Filter zurücksetzen →</a></p>`;
  }
  // Seite jenseits der letzten (z. B. veralteter Link): ehrlich sagen statt 404.
  return `    <p class="meta">Diese Seite ist leer – es gibt nur
    ${nfEur0.format(Math.ceil(daten.gesamt / daten.proSeite))} Seiten.
    <a href="${inserateUrl(daten.filter, daten.sortierung, 1)}">Zur ersten Seite →</a></p>`;
}

export function renderInserateSeite(daten: InserateSeitenDaten): string {
  const gesamtSeiten = Math.max(1, Math.ceil(daten.gesamt / daten.proSeite));
  const zaehler =
    gesamtSeiten > 1 && daten.seite <= gesamtSeiten
      ? `\n    <p class="meta">${nfEur0.format(daten.gesamt)} Inserate · Seite ${nfEur0.format(daten.seite)} von ${nfEur0.format(gesamtSeiten)}</p>`
      : '';

  const inhalt = `  <header>
    <h1>Inseratsbestand</h1>
    <p class="meta">Alle ${nfEur0.format(daten.gesamt)} historisierten Roh-Inserate aus dem
    täglichen Kärnten-Sweep${filterGesetzt(daten) ? ' (gefiltert)' : ''} – hier ohne
    Deduplizierung; das <a href="/">Dashboard</a> rechnet über die zusammengeführten Objekte.
    <a href="/methodik#datenbasis">Methodik</a></p>
  </header>

  <section>
    <h2>Filter</h2>
${filterleiste(daten)}
  </section>

  <section>
    <h2>Inserate</h2>${zaehler}
${inhaltOderLeer(daten)}
  </section>`;

  return seite('Inseratsbestand', inhalt, { breite: 'breit', aktiv: 'inserate' });
}
