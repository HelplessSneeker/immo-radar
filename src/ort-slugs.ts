import type { SuchKriterien } from './search.js';

export type OrtPortal = 'willhaben' | 'immoscout24';

/** Ein beobachteter Ort: Bundesland-Guard + Pfad-Slug je Portal (fehlend = kein Ort-Pfad dort). */
export interface OrtSlugEintrag {
  bundesland: string;
  willhaben?: string;
  immoscout24?: string;
}

// Bewusst statisch und klein: nur Orte, die in Gebieten/Suchen tatsächlich
// vorkommen, jeder Slug gegen die Live-Portale verifiziert (Datum im
// Kommentar). Unbekannte Orte fallen auf die Bundesland-URL zurück – ein
// falscher Slug würde beim Portal 404 auslösen und den Lauf für dieses
// Portal kosten.
export const ORT_SLUGS: Record<string, OrtSlugEintrag> = {
  // verifiziert 2026-07-06; immoscout24 kennt nur klagenfurt-am-woerthersee
  // (klagenfurt-land wäre der Umland-Bezirk)
  klagenfurt: { bundesland: 'kaernten', willhaben: 'klagenfurt', immoscout24: 'klagenfurt-am-woerthersee' },
  '9020': { bundesland: 'kaernten', willhaben: 'klagenfurt', immoscout24: 'klagenfurt-am-woerthersee' },
  // verifiziert 2026-07-06; immoscout24 leitet villach-stadt auf villach um
  villach: { bundesland: 'kaernten', willhaben: 'villach', immoscout24: 'villach' },
};

/** Freitext → Lookup-Schlüssel: trim, lowercase, Umlaute/ß ausschreiben, Whitespace zu "-". */
export function normalisiereOrt(ort: string): string {
  return ort
    .trim()
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/\s+/g, '-');
}

/**
 * Pfad-Slug zum Kriterien-Ort fürs Portal – undefined bei unbekanntem Ort,
 * fehlendem Portal-Slug oder Bundesland-Widerspruch (dann bleibt es bei der
 * Bundesland-weiten URL; filterInserate zieht die Ort-Grenze ohnehin nach).
 */
export function ortSlug(kriterien: SuchKriterien, portal: OrtPortal): string | undefined {
  if (!kriterien.ort) return undefined;
  const eintrag = ORT_SLUGS[normalisiereOrt(kriterien.ort)];
  if (!eintrag || eintrag.bundesland !== kriterien.bundesland) return undefined;
  return eintrag[portal];
}
