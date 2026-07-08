import { escapeHtml, FORMULAR_CSS, seite } from './layout.js';

/**
 * Anmelde-Seite: löst den Browser-Basic-Auth-Dialog durch eine echte Form ab.
 * Reines Template — die Auth-Mechanik (Session-Cookie, Passwort-Vergleich,
 * POST-Handler) baut adeptus-codicus gegen die im PR dokumentierte Contract.
 * Bis dahin bleibt Basic-Auth für alle anderen Pfade unverändert.
 *
 * Design: „Das ruhige Marktbüro" (DESIGN.md). Keine Navbar (User ist noch
 * nicht angemeldet), 560px `schmal` wie alle Formulare, Wortmarke als
 * Türschild über der h1 — Ton bleibt Marktbüro, kein Onboarding-Marketing.
 */

export interface LoginSeitenDaten {
  /** Fehlermeldung nach fehlgeschlagenem POST /login (Rerender). */
  fehler?: string;
  /** Zurückgespiegelter Benutzername bei Fehler; Passwort niemals. */
  benutzer?: string;
  /** Ziel-Pfad nach erfolgreicher Anmeldung (aus ?return=… übernommen). */
  returnPfad?: string;
}

/**
 * Login-eigene Feinheiten. Bewusst wenig: die Feld-Sprache erbt FORMULAR_CSS,
 * die Section-Sprache erbt BASIS_CSS. Nur das Türschild-Label ist neu.
 */
const LOGIN_CSS = `
  .anmeldung-marke {
    margin: 0 0 4px; font-weight: 600; font-size: 13px;
    color: var(--text-secondary);
  }
  .anmeldung-fehler {
    color: var(--status-critical); font-size: 13px; font-weight: 600;
    margin: 0;
  }
`;

export function renderLoginSeite(daten: LoginSeitenDaten = {}): string {
  const meldung = daten.fehler
    ? `<p class="anmeldung-fehler" role="alert">${escapeHtml(daten.fehler)}</p>`
    : '';
  const benutzerWert = escapeHtml(daten.benutzer ?? '');
  const returnWert = escapeHtml(daten.returnPfad ?? '');

  const inhalt = `  <header>
    <p class="anmeldung-marke">immo-radar</p>
    <h1>Anmeldung</h1>
  </header>
  <section>
    <form method="post" action="/login">
      ${meldung}
      <fieldset>
        <label class="feld" for="l-benutzer">Benutzer</label>
        <input type="text" id="l-benutzer" name="benutzer" value="${benutzerWert}" autocomplete="username" required autofocus>
      </fieldset>
      <fieldset>
        <label class="feld" for="l-passwort">Passwort</label>
        <input type="password" id="l-passwort" name="passwort" autocomplete="current-password" required>
      </fieldset>
      <input type="hidden" name="return" value="${returnWert}">
      <button type="submit">Anmelden</button>
    </form>
  </section>`;

  return seite('Anmeldung', inhalt, {
    navbar: false,
    breite: 'schmal',
    extraCss: `${FORMULAR_CSS}${LOGIN_CSS}`,
  });
}
