import type { InseratTyp } from '../types.js';
import type { SuchKriterien } from '../search.js';
import type { SuchUrl } from '../adapters/portal-adapter.js';
import { BUNDESLAENDER } from '../search.js';

const BASIS = 'https://www.willhaben.at/iad/immobilien';

// V1 crawlt nur Wohnungen – Häuser hätten andere Kategorien und würden
// die €/m²-Rendite-Vergleiche verzerren.
const KATEGORIE: Record<InseratTyp, string> = {
  kauf: 'eigentumswohnung',
  miete: 'mietwohnungen',
};

/**
 * Baut die willhaben-Such-URLs zu den Kriterien: eine pro Typ (bei "beide"
 * also zwei). Der Preisfilter wird nur an die URL des Typs gehängt, auf den
 * er sich bezieht – bei "beide" ist das der Kauf (das Formular fragt den
 * Kaufpreis ab); ein Kaufpreis-Bereich würde sonst alle Mieten wegfiltern.
 */
export function buildSearchUrls(kriterien: SuchKriterien): SuchUrl[] {
  const slug = kriterien.bundesland;
  if (!(slug in BUNDESLAENDER)) {
    throw new Error(`Unbekanntes Bundesland "${slug}".`);
  }
  const typen: InseratTyp[] = kriterien.typ === 'beide' ? ['kauf', 'miete'] : [kriterien.typ];
  const preisTyp: InseratTyp = kriterien.typ === 'beide' ? 'kauf' : kriterien.typ;

  return typen.map((typ) => {
    const url = new URL(`${BASIS}/${KATEGORIE[typ]}/${slug}`);
    url.searchParams.set('rows', '30');
    if (typ === preisTyp) {
      if (kriterien.preisMin !== undefined) url.searchParams.set('PRICE_FROM', String(kriterien.preisMin));
      if (kriterien.preisMax !== undefined) url.searchParams.set('PRICE_TO', String(kriterien.preisMax));
    }
    return { url: url.toString(), typ };
  });
}
