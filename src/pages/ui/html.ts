/**
 * Getypter Html-Vertrag des UI-Layers: `string` ist untrusted Text (wird
 * escaped), `Html` ist vertrauenswürdiges Markup (wird roh inlined). Alle
 * Primitives in src/pages/ui/ geben `Html` zurück; manuelles `escapeHtml()`
 * entfällt in migriertem Markup.
 *
 * Laufzeit-Darstellung: `Html` ist zur Laufzeit ein `String`-WRAPPER-OBJEKT
 * mit Marker-Symbol (nur so kann das `html`-Tag verschachteltes Markup vom
 * zu escapenden Text unterscheiden). Beim Interpolieren in gewöhnliche
 * Template-Literale koerziert es automatisch zum Primitive – deshalb bleibt
 * `Html` überall dort einsetzbar, wo `string` erwartet wird (z. B. `seite()`).
 * Daraus folgen drei Regeln:
 *   1. Leerheit mit `x.length === 0` bzw. `LEER` prüfen – NIE `if (x)` oder
 *      `x === ''` (String-Objekte sind immer truthy, `===` vergleicht Referenzen).
 *   2. In Tests vor `toBe`/`toContain` mit `String(x)` zum Primitive machen.
 *   3. Innerhalb von `html\`\``-Interpolationen nie zusätzlich `escapeHtml()`
 *      aufrufen – das Tag escapet selbst (sonst Doppel-Escaping).
 */
import { escapeHtml } from '../layout.js';

declare const HTML_MARKE: unique symbol;

/** Vertrauenswürdiges Markup; zuweisbar an `string`-Parameter. */
export type Html = string & { readonly [HTML_MARKE]: true };

/** Was in `html\`\``-Lücken stehen darf; `null|undefined|false` → ''. */
export type HtmlWert = Html | string | number | null | undefined | false;

const IST_HTML = Symbol('immo-radar.html');

function alsHtml(s: string): Html {
  const wrapper = new String(s) as String & { [IST_HTML]?: true };
  wrapper[IST_HTML] = true;
  return wrapper as unknown as Html;
}

function istHtml(w: unknown): w is Html {
  return w instanceof String && (w as { [IST_HTML]?: true })[IST_HTML] === true;
}

function aufloesen(w: HtmlWert): string {
  if (w === null || w === undefined || w === false) return '';
  if (istHtml(w)) return w.toString();
  if (typeof w === 'number') return String(w);
  return escapeHtml(w);
}

/** Kanonischer Leerwert (`length === 0`) für „nichts rendern"-Slots. */
export const LEER: Html = alsHtml('');

/**
 * Tagged Template: statische Teile roh, Lücken escaped – außer der Wert ist
 * bereits `Html` (dann roh inlined). `bedingung && html\`…\`` funktioniert,
 * weil `false` zu '' wird.
 */
export function html(teile: TemplateStringsArray, ...werte: HtmlWert[]): Html {
  let ergebnis = teile[0] ?? '';
  for (let i = 0; i < werte.length; i++) {
    ergebnis += aufloesen(werte[i]) + (teile[i + 1] ?? '');
  }
  return alsHtml(ergebnis);
}

/** Bewusster Escape-Hatch für vertrautes Markup (SVG, Chart-JSON, Ist-Snippets). */
export function raw(vertraut: string): Html {
  return alsHtml(String(vertraut));
}

/** Fügt Teile roh zusammen; der Trenner ist Layout-Whitespace und bleibt roh. */
export function join(teile: ReadonlyArray<Html | string>, trenner = ''): Html {
  return alsHtml(teile.map((t) => (istHtml(t) ? t.toString() : escapeHtml(t))).join(trenner));
}

/**
 * ` name="wert"` (Wert escaped, führendes Leerzeichen inklusive) – oder LEER
 * bei `null|undefined|false`, damit optionale Attribute schlicht wegfallen.
 */
export function attr(name: string, wert: string | number | null | undefined | false): Html {
  if (wert === null || wert === undefined || wert === false) return LEER;
  return alsHtml(` ${name}="${escapeHtml(String(wert))}"`);
}

/** Klassenliste ohne Falsy-Einträge; plain string (Klassennamen sind escapefrei). */
export function klassen(...teile: Array<string | false | undefined>): string {
  return teile.filter((t): t is string => typeof t === 'string' && t.length > 0).join(' ');
}
