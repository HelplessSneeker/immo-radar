import type { InseratTyp } from '../types.js';
import type { SuchKriterien } from '../search.js';
import type { SuchUrl } from '../adapters/portal-adapter.js';
import { BUNDESLAENDER } from '../search.js';

const BASIS = 'https://www.immoscout24.at/regional';

// Wie bei willhaben: nur Wohnungen – Häuser würden die €/m²-Vergleiche verzerren.
const KATEGORIE: Record<InseratTyp, string> = {
  kauf: 'wohnung-kaufen',
  miete: 'wohnung-mieten',
};

/**
 * Baut die immoscout24-Such-URLs zu den Kriterien: eine pro Typ (bei "beide"
 * also zwei). Der Preisfilter (primaryPriceFrom/To) wird wie bei willhaben
 * nur an die URL des Typs gehängt, auf den er sich bezieht.
 */
export function buildSearchUrls(kriterien: SuchKriterien): SuchUrl[] {
  const slug = kriterien.bundesland;
  if (!(slug in BUNDESLAENDER)) {
    throw new Error(`Unbekanntes Bundesland "${slug}".`);
  }
  const typen: InseratTyp[] = kriterien.typ === 'beide' ? ['kauf', 'miete'] : [kriterien.typ];
  const preisTyp: InseratTyp = kriterien.typ === 'beide' ? 'kauf' : kriterien.typ;

  return typen.map((typ) => {
    const url = new URL(`${BASIS}/${slug}/${KATEGORIE[typ]}`);
    if (typ === preisTyp) {
      if (kriterien.preisMin !== undefined) url.searchParams.set('primaryPriceFrom', String(kriterien.preisMin));
      if (kriterien.preisMax !== undefined) url.searchParams.set('primaryPriceTo', String(kriterien.preisMax));
    }
    return { url: url.toString(), typ };
  });
}
