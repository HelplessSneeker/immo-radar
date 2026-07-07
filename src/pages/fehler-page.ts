import { escapeHtml, seite } from './layout.js';

/** Generische Fehlerseite (400/404/405/413/500) — von jeder Route genutzt. */
export function renderFehlerSeite(status: number, meldung: string): string {
  return seite(
    `Fehler ${status}`,
    `  <header><h1 class="fehler">Fehler ${status}</h1></header>
  <section>
    <p>${escapeHtml(meldung)}</p>
  </section>`,
  );
}
