import { BUNDESLAENDER } from '../search.js';

/**
 * Suchseite und kleine Hilfsseiten des Servers. Wie der Report komplett
 * eigenständiges HTML mit Inline-CSS (gleiche Farbvariablen, hell/dunkel).
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SEITEN_CSS = `
  :root {
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --grid: #e1e0d9;
    --border: rgba(11,11,11,0.10);
    --akzent: #2a78d6;
    --status-critical: #d03b3b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0d0d0d;
      --surface-1: #1a1a19;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --grid: #2c2c2a;
      --border: rgba(255,255,255,0.10);
      --akzent: #3987e5;
      --status-critical: #d03b3b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: var(--page); color: var(--text-primary);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 560px; margin: 0 auto; display: grid; gap: 20px; }
  h1 { font-size: 20px; margin: 0; }
  .meta { color: var(--text-secondary); font-size: 13px; }
  section {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px;
  }
  form { display: grid; gap: 16px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
  legend, label.feld { font-weight: 600; font-size: 13px; padding: 0; }
  .hinweis { color: var(--text-muted); font-size: 12px; }
  select, input[type="number"], input[type="text"] {
    width: 100%; padding: 8px 10px; font: inherit;
    color: var(--text-primary); background: var(--page);
    border: 1px solid var(--grid); border-radius: 6px;
  }
  .bereich { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .radios { display: flex; gap: 16px; }
  .radios label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  button {
    padding: 10px 16px; font: inherit; font-weight: 600;
    color: #fff; background: var(--akzent);
    border: 0; border-radius: 6px; cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: wait; }
  #status { color: var(--text-secondary); font-size: 13px; display: none; }
  .fehler { color: var(--status-critical); }
  a { color: var(--akzent); }
`;

function seite(titel: string, inhalt: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>immo-radar · ${escapeHtml(titel)}</title>
<style>${SEITEN_CSS}</style>
</head>
<body>
<main>
${inhalt}
</main>
</body>
</html>`;
}

export function renderSearchPage(): string {
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
    <form action="/report" method="get" id="suchform">
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
      <p id="status" role="status">Suche läuft, willhaben.at und immoscout24.at werden durchsucht – das dauert ein paar Sekunden …</p>
    </form>
  </section>

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
