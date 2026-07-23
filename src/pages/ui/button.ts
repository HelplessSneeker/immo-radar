/**
 * Buttons in BASIS-CSS-Sprache. Attribut-Reihenfolge ist lastentragend
 * (Seitentests prüfen Substrings): class steht VOR type.
 */
import { attr, html, LEER, raw, type Html } from './html.js';

/** 'klein' = Ghost-Button; 'kritisch' impliziert klein (BASIS_CSS stylt nur button.klein.kritisch). */
export type ButtonVariante = 'klein' | 'kritisch';

export function button(o: {
  text: string;
  typ?: 'submit' | 'button';
  variante?: ButtonVariante;
  deaktiviert?: boolean;
  /** Escape-Hatch für seltene Zusatz-Attribute – als Html, damit die Byte-Ordnung beim Aufrufer sichtbar bleibt. */
  attrs?: Html;
}): Html {
  const klasse =
    o.variante === 'klein' ? 'klein' : o.variante === 'kritisch' ? 'klein kritisch' : undefined;
  return html`<button${attr('class', klasse)} type="${o.typ ?? 'button'}"${
    o.deaktiviert ? raw(' disabled') : LEER
  }${o.attrs ?? LEER}>${o.text}</button>`;
}

export function submitButton(o: { text: string; klein?: boolean }): Html {
  return button({ text: o.text, typ: 'submit', variante: o.klein ? 'klein' : undefined });
}
