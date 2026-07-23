/**
 * Tabellen-Gerüst in BASIS-CSS-Sprache (.tabelle-scroll, .tabelle-karten).
 * In PR 1 bereitgestellt und getestet; die Seiten-Tabellen ziehen in PR 2 um.
 * `einzug` wie bei seitenNav: 4 in Seiten-Sektionen, 6 in verschachtelten
 * Blöcken (Dashboard-Datenpunkte). Attribut-Reihenfolge der Zellen ist
 * lastentragend: class VOR data-label.
 */
import { attr, html, LEER, raw, type Html } from './html.js';

export function kopfzelle(o: { text: string; num?: boolean; scope?: 'col' | 'row' }): Html {
  return html`<th scope="${o.scope ?? 'col'}"${o.num ? raw(' class="num"') : LEER}>${o.text}</th>`;
}

export function zelle(o: { inhalt: Html | string; num?: boolean; label?: string }): Html {
  return html`<td${o.num ? raw(' class="num"') : LEER}${attr('data-label', o.label)}>${o.inhalt}</td>`;
}

export function tabelle(o: {
  /** Kopfzellen (kopfzelle(...)-Join) – landet in <thead><tr>…</tr></thead>. */
  kopf: Html;
  /** Zeilen inkl. eigener Einrückung, mit '\n' gejoint. */
  zeilen: Html;
  /** Mobile-Karten-Umbruch (Top Picks, Datenpunkte, Portfolio). */
  karten?: boolean;
  einzug?: 4 | 6;
}): Html {
  const aussen = raw(' '.repeat(o.einzug ?? 4));
  const innen = raw(' '.repeat((o.einzug ?? 4) + 2));
  return html`${aussen}<div class="tabelle-scroll">
${aussen}<table${o.karten ? raw(' class="tabelle-karten"') : LEER}>
${innen}<thead><tr>${o.kopf}</tr></thead>
${innen}<tbody>
${o.zeilen}
${innen}</tbody>
${aussen}</table>
${aussen}</div>`;
}
