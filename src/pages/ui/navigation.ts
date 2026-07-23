/**
 * Blätter-Navigation (.seiten-nav): reine Textlinks, in der Mitte der Zähler.
 * Am Rand entfällt der jeweilige Link ersatzlos – ein leerer <span> hält die
 * Ausrichtung (kein Disabled-Fake), siehe BASIS_CSS.
 */
import { html, raw, type Html } from './html.js';

export interface SeitenNavLink {
  href: string;
  text: string;
}

/**
 * hrefs kommen aus URLSearchParams-basierten URL-Buildern und werden ROH
 * eingefügt (nacktes `&` zwischen Query-Parametern ist hier Ist-Verhalten,
 * auf das Tests byte-genau prüfen) – niemals vor-escaptes HTML übergeben.
 * `einzug` hält die Byte-Identität zu den historischen Callsites: 4 in
 * Seiten-Sektionen (/inserate), 6 in verschachtelten Blöcken (Dashboard).
 */
export function seitenNav(o: {
  label: string;
  zaehler: Html | string;
  zurueck?: SeitenNavLink;
  weiter?: SeitenNavLink;
  einzug?: 4 | 6;
}): Html {
  const aussen = raw(' '.repeat(o.einzug ?? 4));
  const innen = raw(' '.repeat((o.einzug ?? 4) + 2));
  const link = (l: SeitenNavLink | undefined): Html =>
    l ? html`<a href="${raw(l.href)}">${l.text}</a>` : raw('<span></span>');
  return html`${aussen}<nav class="seiten-nav" aria-label="${o.label}">
${innen}${link(o.zurueck)}
${innen}<span class="meta zaehler">${o.zaehler}</span>
${innen}${link(o.weiter)}
${aussen}</nav>`;
}
