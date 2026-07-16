import { escapeHtml, seite } from './layout.js';

/** Plain-Language-Überschrift je Status – der technische Code steht kleiner darunter. */
const FEHLER_TITEL: Record<number, string> = {
  400: 'Da stimmt etwas mit der Eingabe nicht',
  404: 'Diese Seite gibt es nicht',
  405: 'Das geht hier leider nicht',
  413: 'Das war zu viel auf einmal',
  500: 'Da ist etwas schiefgelaufen',
};

/**
 * Generische Fehlerseite (400/404/405/413/500) — von jeder Route genutzt.
 * Der Rückkehr-Link steht innerhalb der Sektion (nicht nur in der Navbar),
 * damit der Fluss aus der Fehlermeldung heraus direkt zurück nach vorn führt.
 */
export function renderFehlerSeite(status: number, meldung: string): string {
  const titel = FEHLER_TITEL[status] ?? 'Da ist etwas schiefgelaufen';
  return seite(
    `Fehler ${status}`,
    `  <header><h1 class="fehler">${escapeHtml(titel)}</h1></header>
  <section>
    <p>${escapeHtml(meldung)}</p>
    <p class="meta">Fehler ${status} · <a href="/">← Zurück zum Dashboard</a></p>
  </section>`,
  );
}
