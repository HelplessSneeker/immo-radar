import type { PortfolioObjekt } from '../db/portfolio-repo.js';
import {
  EBENEN_LABEL,
  MIN_VERGLEICHSOBJEKTE,
  type PortfolioVergleich,
} from '../portfolio-vergleich.js';
import { datumMedium, fmtRendite, nfEur0, nfEur2, nfTage } from './format.js';
import { escapeHtml, FORMULAR_CSS, seite } from './layout.js';

/**
 * Eigenes Portfolio: manuell gepflegte Wohnungen, jede Zeile dem Markt
 * gegenübergestellt (Miete/m² und Ist-Rendite vs. Markt-Median, mit
 * ausgewiesener Vergleichsebene — Ehrlichkeits-Prinzip).
 */

export interface PortfolioZeileDaten {
  objekt: PortfolioObjekt;
  vergleich: PortfolioVergleich;
}

export interface PortfolioFormFehler {
  werte: URLSearchParams;
  meldung: string;
}

export interface PortfolioSeitenDaten {
  zeilen: PortfolioZeileDaten[];
  /** Stichtag des Marktvergleichs; undefined = noch kein fertiger Sweep. */
  stichtag?: string;
  zielRendite: number;
  fehler?: PortfolioFormFehler;
}

const PORTFOLIO_CSS = `
  ${''/* Tabelle + Formular teilen sich die Basis; nur das Urteil ist eigen. */}
  .ueber-markt { color: var(--good-text); font-weight: 600; }
  .unter-markt { color: var(--text-secondary); }
`;

function feld(
  name: string,
  label: string,
  werte: URLSearchParams | undefined,
  vorbelegung: string,
  optionen: { pflicht?: boolean; hinweis?: string; typ?: string } = {},
): string {
  const wert = werte?.get(name) ?? vorbelegung;
  // Hint per aria-describedby ans Feld gebunden, damit er auch beim
  // Fokussieren vorgelesen wird – visuell hängt er ohnehin am Feld.
  const hinweis = optionen.hinweis
    ? `\n        <span class="hinweis" id="p-${name}-hinweis">${optionen.hinweis}</span>`
    : '';
  const beschreibung = optionen.hinweis ? ` aria-describedby="p-${name}-hinweis"` : '';
  return `      <fieldset>
        <label class="feld" for="p-${name}">${escapeHtml(label)}</label>${hinweis}
        <input type="${optionen.typ ?? 'text'}" id="p-${name}" name="${name}" value="${escapeHtml(wert)}"${optionen.pflicht ? ' required' : ''}${beschreibung}>
      </fieldset>`;
}

/** Formular für Anlegen (objekt=undefined) und Bearbeiten (vorbefüllt). */
function formular(
  aktion: string,
  knopf: string,
  objekt?: PortfolioObjekt,
  fehler?: PortfolioFormFehler,
): string {
  const werte = fehler?.werte;
  const meldung = fehler
    ? `\n      <p class="feld-fehler" role="alert">${escapeHtml(fehler.meldung)}</p>`
    : '';
  const zahl = (n: number | undefined): string => (n === undefined ? '' : String(n));
  return `    <form method="post" action="${aktion}">${meldung}
${feld('bezeichnung', 'Bezeichnung', werte, objekt?.bezeichnung ?? '', { pflicht: true })}
      <div class="bereich">
${feld('plz', 'PLZ', werte, objekt?.plz ?? '', { pflicht: true })}
${feld('ort', 'Ort', werte, objekt?.ort ?? '', { pflicht: true })}
      </div>
      <div class="bereich">
${feld('kaufpreis', 'Kaufpreis (€)', werte, zahl(objekt?.kaufpreis), { pflicht: true })}
${feld('kaufdatum', 'Kaufdatum', werte, objekt?.kaufdatum ?? '', { typ: 'date' })}
      </div>
      <div class="bereich">
${feld('flaeche_m2', 'Wohnfläche (m²)', werte, zahl(objekt?.flaecheM2), { pflicht: true })}
${feld('zimmer', 'Zimmer', werte, zahl(objekt?.zimmer), { pflicht: true })}
      </div>
      <div class="bereich">
${feld('miete_monat', 'Kaltmiete/Monat (€)', werte, zahl(objekt?.mieteMonat), { hinweis: 'leer lassen = leerstehend' })}
${feld('baujahr', 'Baujahr', werte, zahl(objekt?.baujahr))}
      </div>
      <div><button>${escapeHtml(knopf)}</button></div>
    </form>`;
}

function mieteZelle(daten: PortfolioZeileDaten): string {
  const { vergleich } = daten;
  if (vergleich.eigeneMieteM2 === undefined) {
    return '<td class="num" data-label="Miete vs. Markt"><span class="unter-markt">leerstehend</span></td>';
  }
  const eigene = `${nfEur2.format(vergleich.eigeneMieteM2)} €/m²`;
  if (vergleich.miete === undefined) {
    return `<td class="num" data-label="Miete vs. Markt">${eigene}<span class="sub">Markt: zu wenige Vergleiche (&lt; ${MIN_VERGLEICHSOBJEKTE})</span></td>`;
  }
  const markt = vergleich.miete;
  const sub = `Markt ${nfEur2.format(markt.marktMieteM2)} €/m² · ${EBENEN_LABEL[markt.ebene]} (${nfTage.format(markt.anzahl)} Objekte)`;
  const potenzial =
    vergleich.mietPotenzialMonat !== undefined
      ? `<span class="sub">unter Markt: +${nfEur0.format(vergleich.mietPotenzialMonat)} € Potenzial/Monat</span>`
      : '';
  return `<td class="num" data-label="Miete vs. Markt">${eigene}<span class="sub">${escapeHtml(sub)}</span>${potenzial}</td>`;
}

function renditeZelle(daten: PortfolioZeileDaten, zielRendite: number): string {
  const { vergleich } = daten;
  if (vergleich.eigeneRendite === undefined) {
    return '<td class="num meta" data-label="Rendite vs. Markt">–</td>';
  }
  const gut = vergleich.eigeneRendite >= zielRendite;
  const eigene = `<span${gut ? ' class="ueber-markt"' : ''}>${fmtRendite(vergleich.eigeneRendite)}</span>`;
  const markt = vergleich.rendite;
  if (markt === undefined) {
    return `<td class="num" data-label="Rendite vs. Markt">${eigene}<span class="sub">Markt: zu wenige Vergleiche (&lt; ${MIN_VERGLEICHSOBJEKTE} je Seite)</span></td>`;
  }
  // Rendite lebt aus Kauf-Median × Miet-Median – beide Zählungen tragen die
  // Datenbasis (Ehrlichkeits-Prinzip). Die Zählungen stehen als eigene Sub-
  // Zeile, damit die Zelle in schmalen Spalten nicht mitten im Wort umbricht.
  const sub = `Markt ${fmtRendite(markt.marktRendite)} · ${EBENEN_LABEL[markt.ebene]}`;
  const basis = `${nfTage.format(markt.anzahlKauf)} Kauf · ${nfTage.format(markt.anzahlMiete)} Miete`;
  return `<td class="num" data-label="Rendite vs. Markt">${eigene}<span class="sub">${escapeHtml(sub)}</span><span class="sub">${escapeHtml(basis)}</span></td>`;
}

function portfolioTabelle(daten: PortfolioSeitenDaten): string {
  if (daten.zeilen.length === 0) {
    return `    <p class="meta">Noch keine Objekte hinterlegt — leg unten dein erstes an, dann vergleichen wir Miete und Rendite mit dem Markt.</p>`;
  }
  const zeilen = daten.zeilen
    .map(({ objekt, vergleich }) => {
      return `      <tr>
        <td><a href="/portfolio/${objekt.id}/bearbeiten">${escapeHtml(objekt.bezeichnung)}</a><span class="sub">${escapeHtml(`${objekt.plz} ${objekt.ort}`)}${objekt.kaufdatum ? ` · gekauft ${escapeHtml(datumMedium(objekt.kaufdatum))}` : ''}</span></td>
        <td class="num" data-label="Fläche">${nfTage.format(objekt.flaecheM2)} m²<span class="sub">${nfTage.format(objekt.zimmer)} Zi.${objekt.baujahr ? ` · Bj. ${objekt.baujahr}` : ''}</span></td>
        <td class="num" data-label="Kaufpreis">${nfEur0.format(objekt.kaufpreis)} €<span class="sub">${objekt.flaecheM2 > 0 ? `${nfEur0.format(objekt.kaufpreis / objekt.flaecheM2)} €/m²` : ''}</span></td>
        ${mieteZelle({ objekt, vergleich })}
        ${renditeZelle({ objekt, vergleich }, daten.zielRendite)}
        <td><form method="post" action="/portfolio/${objekt.id}/loeschen"><button class="klein kritisch">löschen</button></form></td>
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table class="tabelle-karten">
      <thead><tr><th scope="col">Objekt</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">Kaufpreis</th><th scope="col" class="num">Miete vs. Markt</th><th scope="col" class="num">Rendite vs. Markt</th><th scope="col"><span class="sr-nur">Aktionen</span></th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

export function renderPortfolioSeite(daten: PortfolioSeitenDaten): string {
  const stichtagText = daten.stichtag
    ? `Marktvergleich über die am ${escapeHtml(datumMedium(daten.stichtag))} aktiven Objekte;
    Vergleichsebene je Kennzahl ausgewiesen (PLZ → Bezirk → Kärnten, je nach Datenlage).`
    : 'Noch kein fertiger Sweep — der Marktvergleich erscheint nach dem ersten Crawl-Lauf.';

  const inhalt = `  <header>
    <h1>Eigenes Portfolio</h1>
    <p class="meta">Manuell gepflegte Objekte, unabhängig vom Crawl. ${stichtagText}</p>
  </header>

  <section>
    <h2>Objekte (${daten.zeilen.length})</h2>
${portfolioTabelle(daten)}
  </section>

  <section>
    <h2>Objekt anlegen</h2>
${formular('/portfolio', 'Anlegen', undefined, daten.fehler)}
  </section>`;

  return seite('Portfolio', inhalt, {
    breite: 'breit',
    aktiv: 'portfolio',
    extraCss: FORMULAR_CSS + PORTFOLIO_CSS,
  });
}

export function renderPortfolioBearbeitenSeite(
  objekt: PortfolioObjekt,
  fehler?: PortfolioFormFehler,
): string {
  const inhalt = `  <header>
    <h1>${escapeHtml(objekt.bezeichnung)}</h1>
    <p class="meta"><a href="/portfolio">← Zurück zum Portfolio</a></p>
  </header>

  <section>
    <h2>Bearbeiten</h2>
${formular(`/portfolio/${objekt.id}/bearbeiten`, 'Speichern', objekt, fehler)}
  </section>`;

  return seite(`Portfolio · ${objekt.bezeichnung}`, inhalt, {
    aktiv: 'portfolio',
    extraCss: FORMULAR_CSS + PORTFOLIO_CSS,
  });
}
