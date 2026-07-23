/**
 * Seitengerüst-Bausteine (BASIS_CSS-Sprache). In PR 1 bereitgestellt und
 * getestet; die Seiten selbst ziehen in PR 2 um (Byte-Disziplin).
 * Einrückungs-Konvention: Sektionen/Header sind Top-Level-Blöcke und tragen
 * ihre 2-Space-Einrückung selbst (anders als Feld-Primitives im Slot).
 */
import { attr, html, LEER, type Html } from './html.js';

export function metaHinweis(inhalt: Html | string): Html {
  return html`<p class="meta">${inhalt}</p>`;
}

export function sektion(o: { titel?: string; klasse?: string; id?: string; inhalt: Html }): Html {
  return html`  <section${attr('class', o.klasse)}${attr('id', o.id)}>${
    o.titel !== undefined
      ? html`
    <h2>${o.titel}</h2>`
      : LEER
  }
${o.inhalt}
  </section>`;
}

export function seitenkopf(o: {
  ueberschrift: string;
  /** Plain-language-Orientierungszeile (.intro) zwischen h1 und Meta. */
  intro?: Html | string;
  meta?: Html | string;
}): Html {
  return html`  <header>
    <h1>${o.ueberschrift}</h1>${
      o.intro !== undefined
        ? html`
    <p class="intro">${o.intro}</p>`
        : LEER
    }${
      o.meta !== undefined
        ? html`
    <p class="meta">${o.meta}</p>`
        : LEER
    }
  </header>`;
}

/** Leere-Daten-Sektion („Noch keine Daten") in der Shape von renderOhneDatenSeite. */
export function leerZustand(o: { titel: string; hinweis: Html | string }): Html {
  return html`  <section>
    <h2>${o.titel}</h2>
    <p class="meta">${o.hinweis}</p>
  </section>`;
}
