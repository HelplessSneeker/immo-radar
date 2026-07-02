import type { Suche } from '../db/suchen-repo.js';
import { BUNDESLAENDER } from '../search.js';
import { escapeHtml, seite } from './layout.js';
import { renderHistorieBlock } from './suchen-pages.js';

/**
 * Suchseite und kleine Hilfsseiten des Servers. Gemeinsames Gerüst und CSS
 * liegen in layout.ts.
 */

export function renderSearchPage(letzteSuchen: Suche[] = []): string {
  const optionen = Object.entries(BUNDESLAENDER)
    .map(
      ([slug, name]) =>
        `<option value="${slug}"${slug === 'kaernten' ? ' selected' : ''}>${escapeHtml(name)}</option>`,
    )
    .join('\n        ');

  return seite(
    'Suche',
    `  <header>
    <h1>immo-radar · Suche</h1>
    <p class="meta">Sucht live auf willhaben.at und immoscout24.at und erstellt die Marktanalyse (€/m², Brutto-Rendite) für die kombinierten Treffer.</p>
  </header>

  <section>
    <form action="/suchen" method="post" id="suchform">
      <fieldset>
        <label class="feld" for="bundesland">Bundesland</label>
        <select id="bundesland" name="bundesland">
        ${optionen}
        </select>
      </fieldset>

      <fieldset>
        <legend>Typ</legend>
        <div class="radios">
          <label><input type="radio" name="typ" value="beide" checked> beide</label>
          <label><input type="radio" name="typ" value="kauf"> nur Kauf</label>
          <label><input type="radio" name="typ" value="miete"> nur Miete</label>
        </div>
        <p class="hinweis">Für die Rendite-Berechnung werden Kauf- und Mietdaten benötigt.</p>
      </fieldset>

      <fieldset>
        <legend>Preis in € <span class="hinweis">(bei „nur Miete“: Monatsmiete, sonst Kaufpreis)</span></legend>
        <div class="bereich">
          <input type="number" name="preis_min" min="1" placeholder="von" aria-label="Preis von">
          <input type="number" name="preis_max" min="1" placeholder="bis" aria-label="Preis bis">
        </div>
      </fieldset>

      <fieldset>
        <legend>Wohnfläche in m²</legend>
        <div class="bereich">
          <input type="number" name="flaeche_min" min="1" placeholder="von" aria-label="Fläche von">
          <input type="number" name="flaeche_max" min="1" placeholder="bis" aria-label="Fläche bis">
        </div>
      </fieldset>

      <fieldset>
        <legend>Zimmer</legend>
        <div class="bereich">
          <input type="number" name="zimmer_min" min="1" placeholder="von" aria-label="Zimmer von">
          <input type="number" name="zimmer_max" min="1" placeholder="bis" aria-label="Zimmer bis">
        </div>
      </fieldset>

      <fieldset>
        <label class="feld" for="ort">Ort, PLZ oder Bezirk</label>
        <input type="text" id="ort" name="ort" placeholder="z. B. Villach oder 9500">
      </fieldset>

      <button type="submit" id="senden">Suchen &amp; analysieren</button>
      <p id="status" role="status">Suche wird gestartet …</p>
    </form>
  </section>

${renderHistorieBlock(letzteSuchen)}

  <footer class="meta">
    <p>Datenquellen: willhaben.at und immoscout24.at (Live-Crawl, nur Wohnungen, max. ≈150 bzw. ≈75 Inserate pro Segment). Dasselbe Objekt kann auf beiden Portalen inseriert sein und dann doppelt zählen.</p>
  </footer>

  <script>
    document.getElementById('suchform').addEventListener('submit', function () {
      document.getElementById('senden').disabled = true;
      document.getElementById('status').style.display = 'block';
    });
  </script>`,
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
    <p><a href="/">← Zurück zur Suche</a></p>
  </section>`,
  );
}

export function renderFehlerSeite(status: number, meldung: string): string {
  return seite(
    `Fehler ${status}`,
    `  <header><h1 class="fehler">Fehler ${status}</h1></header>
  <section>
    <p>${escapeHtml(meldung)}</p>
    <p><a href="/">← Zurück zur Suche</a></p>
  </section>`,
  );
}
