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

/** YYYY-MM-DD minus n Tage (UTC-Rechnung, keine DST-Sprünge). */
export function minusTage(datum: string, tage: number): string {
  return new Date(Date.parse(datum) - tage * MS_PRO_TAG).toISOString().slice(0, 10);
}

/** Gültiges YYYY-MM-DD-Datum: Format UND Kalender-Plausibilität (kein 2026-13-40). */
export function istIsoDatum(wert: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) && !Number.isNaN(Date.parse(wert));
}
