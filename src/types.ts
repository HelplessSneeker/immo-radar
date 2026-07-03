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

/**
 * Ein live gecrawltes Inserat samt Herkunftsportal (z. B. "willhaben.at").
 * Datei-Importe haben kein Portal, daher eigener Typ statt Feld auf Inserat.
 */
export interface InseratMitPortal extends Inserat {
  portal: string;
}
