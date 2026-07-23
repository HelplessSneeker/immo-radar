import { seite } from './layout.js';

/**
 * Konto-Stub: Ziel des Benutzer-Slots in der Seitenleiste. Die eigentliche
 * Verwaltung (Passwort, Sitzungen) kommt mit dem Anmelde-Zyklus – bewusst
 * ohne Formular, ohne Backend und ohne aktiven Nav-Eintrag.
 */
export function renderKontoSeite(): string {
  const inhalt = `  <header>
    <h1>Konto</h1>
  </header>
  <section>
    <h2>In Arbeit</h2>
    <p class="meta">Konto-Verwaltung kommt mit dem Anmelde-Zyklus.</p>
  </section>`;
  return seite('Konto', inhalt);
}
