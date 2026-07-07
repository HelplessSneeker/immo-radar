/**
 * Normalisierung der Portal-Rohdaten fürs Objekt-Matching. Bewusst nur hier
 * angewendet — die Roh-Zeilen in inserate_bestand bleiben, wie die Portale
 * sie liefern.
 */

/**
 * Österreichische PLZ: die erste 4-stellige Ziffernfolge aus dem PLZ-Feld,
 * ersatzweise aus dem Ort ("9020 Klagenfurt"). undefined, wenn nirgends
 * eine steht — solche Inserate matchen nur über die rohe PLZ.
 */
export function normalisierePlz(plz: string, ort?: string): string | undefined {
  return /\b(\d{4})\b/.exec(plz)?.[1] ?? (ort ? /\b(\d{4})\b/.exec(ort)?.[1] : undefined);
}

/**
 * Kanonischer Anzeigename eines Orts: Whitespace kollabiert, eine führende
 * PLZ abgestreift ("9020 Klagenfurt" → "Klagenfurt").
 */
export function kanonischerOrt(ort: string): string {
  const kompakt = ort.trim().replace(/\s+/g, ' ');
  const ohnePlz = kompakt.replace(/^\d{4}\s+/, '');
  return ohnePlz || kompakt;
}
