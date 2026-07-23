import { FORMULAR_CSS, seite } from './layout.js';
import { submitButton } from './ui/button.js';
import { fehlerHinweis, formular, passwortFeld, textFeld, versteckt } from './ui/formular.js';
import { html, LEER } from './ui/html.js';

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
    margin: 0 0 4px; font-weight: var(--gewicht-stark); font-size: var(--fs-label);
    color: var(--text-secondary);
  }
  .anmeldung-fehler {
    color: var(--status-critical); font-size: var(--fs-label); font-weight: var(--gewicht-stark);
    margin: 0;
  }
`;

export function renderLoginSeite(daten: LoginSeitenDaten = {}): string {
  const meldung = daten.fehler
    ? fehlerHinweis({ text: daten.fehler, klasse: 'anmeldung-fehler' })
    : LEER;

  const form = formular({
    methode: 'post',
    aktion: '/login',
    inhalt: html`
      ${meldung}
      ${textFeld({
        id: 'l-benutzer',
        name: 'benutzer',
        label: 'Benutzer',
        wert: daten.benutzer ?? '',
        umschlag: 'fieldset',
        autovervollstaendigen: 'username',
        erforderlich: true,
        autofokus: true,
      })}
      ${passwortFeld({
        id: 'l-passwort',
        name: 'passwort',
        label: 'Passwort',
        umschlag: 'fieldset',
        autovervollstaendigen: 'current-password',
        erforderlich: true,
      })}
      ${versteckt('return', daten.returnPfad ?? '')}
      ${submitButton({ text: 'Anmelden' })}`,
  });

  const inhalt = `  <header>
    <p class="anmeldung-marke">immo-radar</p>
    <h1>Anmeldung</h1>
  </header>
  <section>
${form}
  </section>`;

  return seite('Anmeldung', inhalt, {
    navbar: false,
    breite: 'schmal',
    extraCss: `${FORMULAR_CSS}${LOGIN_CSS}`,
  });
}
