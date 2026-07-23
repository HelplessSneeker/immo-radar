/**
 * Formularfelder in beiden CSS-Kontexten des Systems:
 *  - `umschlag: 'feld'` (Default) rendert `<div class="feld">` mit nacktem
 *    Label – die Sprache der Filterleisten (BASIS_CSS `.filterleiste .feld`).
 *  - `umschlag: 'fieldset'` rendert `<fieldset><label class="feld">` – die
 *    Sprache der FORMULAR_CSS-Seiten (Login, künftig Account-Formulare).
 *
 * Einrückungs-Konvention aller Feld-Primitives: die erste Zeile trägt KEINEN
 * Einzug (den setzt der Slot, z. B. filterLeiste mit `\n      `), Innenzeilen
 * stehen absolut auf 8, Schlusszeilen auf 6 Leerzeichen. Attribut-Reihenfolge
 * ist lastentragend: type, id, name, [inputmode], [value], [placeholder],
 * [autocomplete], [required], [autofocus] – `wert: undefined` lässt das
 * value-Attribut KOMPLETT weg (Pflicht beim Passwortfeld).
 */
import { attr, html, join, klassen, LEER, raw, type Html } from './html.js';

export function formular(o: { methode: 'get' | 'post'; aktion: string; inhalt: Html }): Html {
  return html`    <form method="${o.methode}" action="${o.aktion}">${o.inhalt}
    </form>`;
}

export interface TextFeldOptionen {
  id: string;
  name: string;
  label: string;
  /** undefined ⇒ kein value-Attribut; '' ⇒ `value=""`. */
  wert?: string;
  typ?: 'text' | 'password';
  platzhalter?: string;
  inputmode?: 'numeric' | 'decimal';
  /** Zusatzklasse neben `feld` (nur umschlag 'feld'), z. B. 'feld-plz'. */
  klasse?: string;
  umschlag?: 'feld' | 'fieldset';
  autovervollstaendigen?: string;
  erforderlich?: boolean;
  autofokus?: boolean;
}

export function textFeld(o: TextFeldOptionen): Html {
  const eingabe = html`<input type="${o.typ ?? 'text'}" id="${o.id}" name="${o.name}"${attr(
    'inputmode',
    o.inputmode,
  )}${o.wert !== undefined ? html` value="${o.wert}"` : LEER}${attr('placeholder', o.platzhalter)}${attr(
    'autocomplete',
    o.autovervollstaendigen,
  )}${o.erforderlich ? raw(' required') : LEER}${o.autofokus ? raw(' autofocus') : LEER}>`;
  if (o.umschlag === 'fieldset') {
    return html`<fieldset>
        <label class="feld" for="${o.id}">${o.label}</label>
        ${eingabe}
      </fieldset>`;
  }
  return html`<div class="${klassen('feld', o.klasse)}">
        <label for="${o.id}">${o.label}</label>
        ${eingabe}
      </div>`;
}

export function passwortFeld(
  o: Omit<TextFeldOptionen, 'typ' | 'wert' | 'inputmode' | 'platzhalter'>,
): Html {
  // Bewusst ohne `wert`: ein Passwort wird nie zurückgespiegelt.
  return textFeld({ ...o, typ: 'password' });
}

export function optionen(
  eintraege: ReadonlyArray<readonly [string, string]>,
  ausgewaehlt?: string,
): Html {
  return join(
    eintraege.map(
      ([wert, label]) =>
        html`<option value="${wert}"${wert === (ausgewaehlt ?? '') ? raw(' selected') : LEER}>${label}</option>`,
    ),
  );
}

export function selectFeld(o: {
  id: string;
  name: string;
  label: string;
  optionen: ReadonlyArray<readonly [string, string]>;
  ausgewaehlt?: string;
}): Html {
  return html`<div class="feld">
        <label for="${o.id}">${o.label}</label>
        <select id="${o.id}" name="${o.name}">${optionen(o.optionen, o.ausgewaehlt)}</select>
      </div>`;
}

export interface FeldTeil {
  id: string;
  name: string;
  /** Zahl oder String; undefined rendert `value=""` (Bereichsfelder tragen value immer). */
  wert: string | number | undefined;
  inputmode?: 'numeric' | 'decimal';
  platzhalter?: string;
  ariaLabel: string;
}

export function vonBisFeld(o: {
  legend: string;
  klasse?: string;
  typ?: 'text' | 'date';
  von: FeldTeil;
  bis: FeldTeil;
}): Html {
  const eingabe = (t: FeldTeil): Html =>
    html`<input type="${o.typ ?? 'text'}" id="${t.id}" name="${t.name}"${attr(
      'inputmode',
      t.inputmode,
    )} value="${t.wert ?? ''}"${attr('placeholder', t.platzhalter)} aria-label="${t.ariaLabel}">`;
  return html`<fieldset class="${klassen('feld', o.klasse)}">
        <legend>${o.legend}</legend>
        <div class="von-bis">
          ${eingabe(o.von)}
          ${eingabe(o.bis)}
        </div>
      </fieldset>`;
}

export function checkboxFeld(o: {
  name: string;
  wert: string;
  label: string;
  checked?: boolean;
  /** Meta-Zeile unter dem Schalter, z. B. der Methodik-Link. */
  hinweis?: Html;
}): Html {
  return html`<div class="feld feld-toggle">
        <label><input type="checkbox" name="${o.name}" value="${o.wert}"${
          o.checked ? raw(' checked') : LEER
        }> ${o.label}</label>${
          o.hinweis !== undefined
            ? html`
        <p class="meta">${o.hinweis}</p>`
            : LEER
        }
      </div>`;
}

/** Zugeklapptes <details> in der Filterleiste (Mehrfach-Facetten). Attribut-Reihenfolge class→open. */
export function detailsFacette(o: { summary: string; offen?: boolean; inhalt: Html }): Html {
  return html`<details class="feld-ausstattung"${o.offen ? raw(' open') : LEER}>
        <summary>${o.summary}</summary>
        ${o.inhalt}
      </details>`;
}

export function versteckt(name: string, wert: string): Html {
  return html`<input type="hidden" name="${name}" value="${wert}">`;
}

/** Sichtbarer Fehlerpfad der Formularseiten; Klasse überschreibbar (Login: 'anmeldung-fehler'). */
export function fehlerHinweis(o: { text: string; klasse?: string }): Html {
  return html`<p class="${o.klasse ?? 'feld-fehler'}" role="alert">${o.text}</p>`;
}
