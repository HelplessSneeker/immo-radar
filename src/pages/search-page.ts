import type { Suche } from '../db/suchen-repo.js';
import { BUNDESLAENDER } from '../search.js';
import { escapeHtml, FORMULAR_CSS, seite } from './layout.js';
import { renderHistorieBlock } from './suchen-pages.js';

/**
 * Suchseite und kleine Hilfsseiten des Servers. Gemeinsames Gerüst und CSS
 * liegen in layout.ts.
 */

/** Eingegebene Rohwerte + Fehlermeldung, um ein Formular nach 400 wieder zu füllen. */
export interface FormFehler {
  werte: URLSearchParams;
  meldung: string;
}

function wert(werte: URLSearchParams | undefined, name: string): string {
  const roh = werte?.get(name)?.trim();
  return roh ? ` value="${escapeHtml(roh)}"` : '';
}

/** Die Kriterien-Formularfelder – gemeinsam für Suchseite und Gebiete-Seite. */
export function kriterienFelder(
  typHinweis: string,
  werte?: URLSearchParams,
  standardBundesland = 'kaernten',
): string {
  const gewaehlt = werte?.get('bundesland') ?? standardBundesland;
  const optionen = Object.entries(BUNDESLAENDER)
    .map(
      ([slug, name]) =>
        `<option value="${slug}"${slug === gewaehlt ? ' selected' : ''}>${escapeHtml(name)}</option>`,
    )
    .join('\n        ');
  const typ = werte?.get('typ') ?? 'beide';
  const typRadio = (v: string, label: string) =>
    `<label><input type="radio" name="typ" value="${v}"${typ === v ? ' checked' : ''}> ${label}</label>`;

  return `      <fieldset>
        <label class="feld" for="bundesland">Bundesland</label>
        <select id="bundesland" name="bundesland">
        ${optionen}
        </select>
      </fieldset>

      <fieldset>
        <legend>Typ</legend>
        <div class="radios">
          ${typRadio('beide', 'beide')}
          ${typRadio('kauf', 'nur Kauf')}
          ${typRadio('miete', 'nur Miete')}
        </div>
        <p class="hinweis">${escapeHtml(typHinweis)}</p>
      </fieldset>

      <fieldset>
        <legend>Preis in € <span class="hinweis">(bei „nur Miete“: Monatsmiete, sonst Kaufpreis)</span></legend>
        <div class="bereich">
          <input type="number" name="preis_min" min="1" placeholder="von" aria-label="Preis von"${wert(werte, 'preis_min')}>
          <input type="number" name="preis_max" min="1" placeholder="bis" aria-label="Preis bis"${wert(werte, 'preis_max')}>
        </div>
      </fieldset>

      <fieldset>
        <legend>Wohnfläche in m²</legend>
        <div class="bereich">
          <input type="number" name="flaeche_min" min="1" placeholder="von" aria-label="Fläche von"${wert(werte, 'flaeche_min')}>
          <input type="number" name="flaeche_max" min="1" placeholder="bis" aria-label="Fläche bis"${wert(werte, 'flaeche_max')}>
        </div>
      </fieldset>

      <fieldset>
        <legend>Zimmer</legend>
        <div class="bereich">
          <input type="number" name="zimmer_min" min="1" placeholder="von" aria-label="Zimmer von"${wert(werte, 'zimmer_min')}>
          <input type="number" name="zimmer_max" min="1" placeholder="bis" aria-label="Zimmer bis"${wert(werte, 'zimmer_max')}>
        </div>
      </fieldset>

      <fieldset>
        <label class="feld" for="ort">Ort, PLZ oder Bezirk</label>
        <input type="text" id="ort" name="ort" placeholder="z. B. Villach oder 9500"${wert(werte, 'ort')}>
      </fieldset>`;
}

/** Fehlermeldung im Formular, nahe am Absende-Button. */
export function formFehlerBlock(fehler: FormFehler | undefined): string {
  if (!fehler) return '';
  return `      <p class="feld-fehler" role="alert">${escapeHtml(fehler.meldung)}</p>\n`;
}

/**
 * Client-seitige von≤bis-Prüfung über die native Validierungs-Blase
 * (setCustomValidity) – der Server prüft dieselben Bereiche nochmal.
 */
export function bereichsPruefungJs(formVar: string): string {
  return `      const paare = [['preis_min','preis_max','Preis'],['flaeche_min','flaeche_max','Fläche'],['zimmer_min','zimmer_max','Zimmer']];
      for (const [minName, maxName, label] of paare) {
        const min = ${formVar}.elements[minName], max = ${formVar}.elements[maxName];
        max.setCustomValidity('');
        if (min.value && max.value && Number(min.value) > Number(max.value)) {
          max.setCustomValidity(label + ': „von“ darf nicht größer als „bis“ sein.');
          max.reportValidity();
          return false;
        }
      }
      return true;`;
}

export function renderSearchPage(letzteSuchen: Suche[] = [], fehler?: FormFehler): string {
  // Vorauswahl aus der letzten Suche – wer zuletzt Tirol suchte, sucht selten Kärnten.
  const standardBundesland = letzteSuchen[0]?.kriterien.bundesland ?? 'kaernten';
  return seite(
    'Suche',
    `  <header>
    <h1>Suche</h1>
    <p class="meta">Sucht live auf willhaben.at und immoscout24.at und erstellt die Marktanalyse (€/m², Brutto-Rendite)
    für die kombinierten Treffer – für die schnelle Markteinschätzung; dauerhafte Beobachtung
    übernehmen die <a href="/">Beobachtungsgebiete</a>.</p>
  </header>

  <section>
    <form action="/suchen" method="post" id="suchform">
${kriterienFelder('Für die Rendite-Berechnung werden Kauf- und Mietdaten benötigt.', fehler?.werte, standardBundesland)}

${formFehlerBlock(fehler)}      <button type="submit" id="senden"><span class="senden-inhalt">Suchen &amp; analysieren</span></button>
      <p class="sr-nur" id="senden-status" role="status" aria-live="polite"></p>
    </form>
  </section>

${renderHistorieBlock(letzteSuchen)}

  <footer class="meta">
    <p>Datenquellen: willhaben.at und immoscout24.at (Live-Crawl, nur Wohnungen, max. ≈150 bzw. ≈75 Inserate pro Segment). Dasselbe Objekt kann auf beiden Portalen inseriert sein und dann doppelt zählen.</p>
  </footer>

  <script>
    document.getElementById('suchform').addEventListener('submit', function (e) {
      const gueltig = (function (form) {
${bereichsPruefungJs('form')}
      })(this);
      if (!gueltig) { e.preventDefault(); return; }
      const senden = document.getElementById('senden');
      senden.disabled = true;
      senden.classList.add('laeuft');
      senden.querySelector('.senden-inhalt').innerHTML = '<span class="senden-puls" aria-hidden="true"></span>Suche wird gestartet …';
      document.getElementById('senden-status').textContent = 'Suche wird gestartet, gleich geht es weiter.';
    });
  </script>`,
    { aktiv: 'suche', extraCss: FORMULAR_CSS },
  );
}

export function renderKeineTrefferSeite(quellen: string[]): string {
  const liste = quellen.map((q) => `<li>${escapeHtml(q)}</li>`).join('\n      ');
  return seite(
    'Keine Treffer',
    `  <header><h1>Keine Treffer</h1></header>
  <section>
    <p>Für diese Suchkriterien wurden keine verwertbaren Inserate gefunden.</p>
    <ul class="meta">
      ${liste}
    </ul>
    <p>Tipp: Kriterien lockern (größerer Preisbereich, ohne Ort) und erneut suchen.</p>
  </section>`,
  );
}

export function renderFehlerSeite(status: number, meldung: string): string {
  return seite(
    `Fehler ${status}`,
    `  <header><h1 class="fehler">Fehler ${status}</h1></header>
  <section>
    <p>${escapeHtml(meldung)}</p>
  </section>`,
  );
}
