import type {
  BestandInseratMitLand,
  InserateFilter,
  InserateSortierung,
} from '../db/bestand-repo.js';
import { tageZwischen } from '../datum.js';
import { BUNDESLAENDER } from '../search.js';
import { inseratSchluessel, type PreisAenderung } from '../trend.js';
import { aenderungsZelle, datumMedium, eurM2Wert, nfEur0, nfTage } from './format.js';
import { escapeHtml, seite } from './layout.js';

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
  if (sortierung !== 'zuletzt_gesehen') params.set('sortierung', sortierung);
  if (seiteNr > 1) params.set('seite', String(seiteNr));
  const query = params.toString();
  return query ? `/inserate?${query}` : '/inserate';
}

function filterGesetzt(daten: InserateSeitenDaten): boolean {
  const f = daten.filter;
  return Boolean(
    f.bundesland || f.typ || f.status || f.ort || daten.sortierung !== 'zuletzt_gesehen',
  );
}

function optionen(
  eintraege: ReadonlyArray<readonly [string, string]>,
  ausgewaehlt: string | undefined,
): string {
  return eintraege
    .map(
      ([wert, label]) =>
        `<option value="${escapeHtml(wert)}"${wert === (ausgewaehlt ?? '') ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');
}

function filterleiste(daten: InserateSeitenDaten): string {
  const laender: Array<readonly [string, string]> = [
    ['', 'alle Bundesländer'],
    ...Object.entries(BUNDESLAENDER),
  ];
  const zuruecksetzen = filterGesetzt(daten)
    ? '\n      <p class="meta"><a href="/inserate">Filter zurücksetzen</a></p>'
    : '';
  return `    <form class="filterleiste" method="get" action="/inserate">
      <div class="feld">
        <label for="f-bundesland">Bundesland</label>
        <select id="f-bundesland" name="bundesland">${optionen(laender, daten.filter.bundesland)}</select>
      </div>
      <div class="feld">
        <label for="f-typ">Typ</label>
        <select id="f-typ" name="typ">${optionen(
          [
            ['', 'Kauf & Miete'],
            ['kauf', 'Kauf'],
            ['miete', 'Miete'],
          ],
          daten.filter.typ,
        )}</select>
      </div>
      <div class="feld">
        <label for="f-status">Status</label>
        <select id="f-status" name="status">${optionen(
          [
            ['', 'aktiv & delistet'],
            ['aktiv', 'aktiv'],
            ['delistet', 'delistet'],
          ],
          daten.filter.status,
        )}</select>
      </div>
      <div class="feld">
        <label for="f-ort">Ort / PLZ / Bezirk</label>
        <input type="text" id="f-ort" name="ort" value="${escapeHtml(daten.filter.ort ?? '')}" placeholder="z. B. Villach">
      </div>
      <div class="feld">
        <label for="f-sortierung">Sortierung</label>
        <select id="f-sortierung" name="sortierung">${optionen(
          Object.entries(SORTIERUNG_LABELS) as Array<[InserateSortierung, string]>,
          daten.sortierung,
        )}</select>
      </div>
      <button class="klein" type="submit">Filtern</button>${zuruecksetzen}
    </form>`;
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
  return `      <tr>
        <td>${link}<span class="sub">${sub}</span></td>
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${nfEur0.format(i.flaeche_m2)} m²</td>
        <td class="num">${eurM2Wert(i)}</td>
        ${aenderungsZelle(daten.aenderungen.get(inseratSchluessel(i.portal, i.id)))}
        <td>${escapeHtml(datumMedium(i.zuerstGesehen))} – ${escapeHtml(datumMedium(i.zuletztGesehen))}<span class="sub">${nfTage.format(tage)} Tage</span></td>
        <td>${status}</td>
      </tr>`;
}

function tabelle(daten: InserateSeitenDaten): string {
  const zeilen = daten.inserate.map((i) => inseratZeile(i, daten)).join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th><th scope="col" class="num">letzte Preisänderung</th><th scope="col">gesehen</th><th scope="col">Status</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function seitenNav(daten: InserateSeitenDaten): string {
  const gesamtSeiten = Math.max(1, Math.ceil(daten.gesamt / daten.proSeite));
  if (gesamtSeiten <= 1) return '';
  const zurueck =
    daten.seite > 1
      ? `<a href="${inserateUrl(daten.filter, daten.sortierung, daten.seite - 1)}">← Zurück</a>`
      : '<span></span>';
  const weiter =
    daten.seite < gesamtSeiten
      ? `<a href="${inserateUrl(daten.filter, daten.sortierung, daten.seite + 1)}">Weiter →</a>`
      : '<span></span>';
  return `    <nav class="seiten-nav" aria-label="Seiten">
      ${zurueck}
      <span class="meta zaehler">Seite ${nfEur0.format(daten.seite)} von ${nfEur0.format(gesamtSeiten)} · ${nfEur0.format(daten.gesamt)} Inserate</span>
      ${weiter}
    </nav>`;
}

function inhaltOderLeer(daten: InserateSeitenDaten): string {
  if (daten.inserate.length > 0) {
    return `${tabelle(daten)}
${seitenNav(daten)}`;
  }
  if (daten.gesamt === 0 && !filterGesetzt(daten)) {
    return `    <p class="meta">Der Bestand ist leer – er entsteht aus den täglichen Crawls der
    Beobachtungsgebiete. <a href="/">Erstes Gebiet anlegen →</a></p>`;
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
    <p class="meta">Alle ${nfEur0.format(daten.gesamt)} historisierten Inserate aus den
    Gebiets-Crawls${filterGesetzt(daten) ? ' (gefiltert)' : ''}. Der Bestand ist
    gebiets-übergreifend; die Gebiets-Auswertungen filtern ihn nach ihren Kriterien.
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
