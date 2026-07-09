import { escapeHtml, seite } from './layout.js';

/**
 * Generische Fehlerseite (400/404/405/413/500) — von jeder Route genutzt.
 * Der Rückkehr-Link steht innerhalb der Sektion (nicht nur in der Navbar),
 * damit der Fluss aus der Fehlermeldung heraus direkt zurück nach vorn führt.
 */
export function renderFehlerSeite(status: number, meldung: string): string {
  return seite(
    `Fehler ${status}`,
    `  <header><h1 class="fehler">Fehler ${status}</h1></header>
  <section>
    <p>${escapeHtml(meldung)}</p>
    <p class="meta"><a href="/">← Zurück zum Dashboard</a></p>
  </section>`,
  );
}
