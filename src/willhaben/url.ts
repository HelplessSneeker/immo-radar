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

// Am 2026-07-06 gegen die Live-Suche verifiziert: ESTATE_SIZE_FROM und
// NUMBER_OF_ROOMS_FROM ignoriert das Portal still (Trefferzahl unverändert);
// wirksam sind das Attribut ESTATE_SIZE/LIVING_AREA (das "/" darf
// prozent-kodiert sein) und die Zimmer-Buckets.
const PARAM_FLAECHE_VON = 'ESTATE_SIZE/LIVING_AREA_FROM';
const PARAM_FLAECHE_BIS = 'ESTATE_SIZE/LIVING_AREA_TO';
const PARAM_ZIMMER_BUCKET = 'NO_OF_ROOMS_BUCKET';

// Zimmer kennt willhaben nur als Buckets 1X1 … 5X5 (mehrfach = Vereinigung);
// 5X5 heißt "5+" – in Wien liefert 6X6 trotz 20k Inseraten null Treffer.
const ZIMMER_BUCKET_MAX = 5;

/**
 * Buckets zum Zimmer-Bereich, über-approximiert (floor/bucket-5-Deckel), damit
 * kein relevantes Inserat wegfällt – die exakten Grenzen zieht filterInserate.
 * Leeres Array = Parameter weglassen (Bereich nicht abbildbar oder alles).
 */
function zimmerBuckets(min?: number, max?: number): string[] {
  const von = Math.min(Math.max(1, Math.floor(min ?? 1)), ZIMMER_BUCKET_MAX);
  const bis = Math.min(Math.ceil(max ?? ZIMMER_BUCKET_MAX), ZIMMER_BUCKET_MAX);
  const buckets: string[] = [];
  for (let zimmer = von; zimmer <= bis; zimmer++) buckets.push(`${zimmer}X${zimmer}`);
  return buckets.length === ZIMMER_BUCKET_MAX ? [] : buckets;
}

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
    // Fläche/Zimmer gelten anders als der Preis für Kauf und Miete gleichermaßen.
    if (kriterien.flaecheMin !== undefined) url.searchParams.set(PARAM_FLAECHE_VON, String(kriterien.flaecheMin));
    if (kriterien.flaecheMax !== undefined) url.searchParams.set(PARAM_FLAECHE_BIS, String(kriterien.flaecheMax));
    if (kriterien.zimmerMin !== undefined || kriterien.zimmerMax !== undefined) {
      for (const bucket of zimmerBuckets(kriterien.zimmerMin, kriterien.zimmerMax)) {
        url.searchParams.append(PARAM_ZIMMER_BUCKET, bucket);
      }
    }
    return { url: url.toString(), typ };
  });
}
