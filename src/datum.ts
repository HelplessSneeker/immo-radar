/** Datums-Helfer: alle Tagesdaten im Format YYYY-MM-DD (UTC). */

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/** Heutiges UTC-Datum als YYYY-MM-DD. */
export function heutigesDatum(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ganze Tage zwischen zwei YYYY-MM-DD-Daten (bis − von, kann negativ sein). */
export function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(bis) - Date.parse(von)) / MS_PRO_TAG);
}
