export type InseratTyp = 'kauf' | 'miete';

/**
 * Ein Inserat. `preis` ist bei typ=kauf der Kaufpreis in €,
 * bei typ=miete die monatliche Kaltmiete in €.
 */
export interface Inserat {
  id: string;
  typ: InseratTyp;
  ort: string;
  plz: string;
  bezirk: string;
  preis: number;
  flaeche_m2: number;
  zimmer: number;
  baujahr?: number;
  zustand?: string;
  url?: string;
  datum_erfasst: string; // ISO-Datum (YYYY-MM-DD)
}
