import type { InseratTyp } from '../types.js';
import type { SuchKriterien } from '../search.js';
import type { SuchUrl } from '../adapters/portal-adapter.js';
import { BUNDESLAENDER } from '../search.js';
import { ortSlug } from '../ort-slugs.js';

const BASIS = 'https://www.immoscout24.at/regional';

// Wie bei willhaben: nur Wohnungen – Häuser würden die €/m²-Vergleiche verzerren.
const KATEGORIE: Record<InseratTyp, string> = {
  kauf: 'wohnung-kaufen',
  miete: 'wohnung-mieten',
};

// Am 2026-07-06 gegen die Live-Suche verifiziert: livingSpaceFrom/To antwortet
// mit HTTP 404 – wirksam sind primaryArea* und numberOfRooms* (Trefferzahl
// sinkt entsprechend, Filter überleben die /seite-N-Pagination).
const PARAM_FLAECHE_VON = 'primaryAreaFrom';
const PARAM_FLAECHE_BIS = 'primaryAreaTo';
const PARAM_ZIMMER_VON = 'numberOfRoomsFrom';
const PARAM_ZIMMER_BIS = 'numberOfRoomsTo';

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
  // Ort liegt im Pfad zwischen Bundesland und Kategorie; die Pagination
  // (/seite-N) hängt der Adapter hinter die Kategorie, das bleibt kompatibel.
  const ort = ortSlug(kriterien, 'immoscout24');

  return typen.map((typ) => {
    const url = new URL(`${BASIS}/${slug}${ort ? `/${ort}` : ''}/${KATEGORIE[typ]}`);
    if (typ === preisTyp) {
      if (kriterien.preisMin !== undefined) url.searchParams.set('primaryPriceFrom', String(kriterien.preisMin));
      if (kriterien.preisMax !== undefined) url.searchParams.set('primaryPriceTo', String(kriterien.preisMax));
    }
    // Fläche/Zimmer gelten anders als der Preis für Kauf und Miete gleichermaßen.
    if (kriterien.flaecheMin !== undefined) url.searchParams.set(PARAM_FLAECHE_VON, String(kriterien.flaecheMin));
    if (kriterien.flaecheMax !== undefined) url.searchParams.set(PARAM_FLAECHE_BIS, String(kriterien.flaecheMax));
    if (kriterien.zimmerMin !== undefined) url.searchParams.set(PARAM_ZIMMER_VON, String(kriterien.zimmerMin));
    if (kriterien.zimmerMax !== undefined) url.searchParams.set(PARAM_ZIMMER_BIS, String(kriterien.zimmerMax));
    return { url: url.toString(), typ };
  });
}
