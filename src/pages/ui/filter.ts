/**
 * Rahmen der Filterleiste (inline GET-Formular über Auswertungstabellen):
 * Form-Tag, Feld-Join, Filtern-Button und Reset-Link zentral – die Felder
 * kommen als Slot-Array. Leere Einträge (LEER, false, undefined) fallen weg,
 * z. B. Facetten ohne Optionen; jedes Feld bekommt `\n      ` vorangestellt
 * (Byte-Kontrakt der historischen Leisten, von Tests inkl. Whitespace geprüft).
 */
import { submitButton } from './button.js';
import { html, join, LEER, type Html } from './html.js';

export function filterLeiste(o: {
  aktion: string;
  felder: ReadonlyArray<Html | false | undefined>;
  /** Gesetzt ⇒ Reset-Zeile „Filter zurücksetzen" hinter dem Button. */
  zuruecksetzenHref?: string;
  /** Roh hinter </form>, z. B. der Top-Picks-Ignoriert-Hinweis. */
  extra?: Html;
}): Html {
  const felder = o.felder.filter(
    (f): f is Html => f !== false && f !== undefined && f.length > 0,
  );
  const zuruecksetzen =
    o.zuruecksetzenHref !== undefined
      ? html`
      <p class="meta"><a href="${o.zuruecksetzenHref}">Filter zurücksetzen</a></p>`
      : LEER;
  return html`    <form class="filterleiste" method="get" action="${o.aktion}">${join(
    felder.map((f) => html`
      ${f}`),
  )}
      ${submitButton({ text: 'Filtern', klein: true })}${zuruecksetzen}
    </form>${o.extra ?? LEER}`;
}
