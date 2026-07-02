import type { Inserat, InseratTyp } from '../types.js';
import type { SuchKriterien } from '../search.js';
import type { SourceAdapter } from './source-adapter.js';

/**
 * Gemeinsames Interface der Immobilienportale (willhaben, immoscout24, …).
 * Jedes Portal bringt sein eigenes URL-Schema und seine eigene Extraktion
 * mit; der Server kennt nur dieses Interface.
 */

/**
 * Basisklasse für Portal-Fehler (nicht erreichbar, blockiert, Layout
 * geändert). Der Server antwortet erst mit 502, wenn alle Portale scheitern.
 */
export class PortalFehler extends Error {}

/** Eine Such-URL eines Portals samt dem Inserat-Typ, den sie liefert. */
export interface SuchUrl {
  url: string;
  typ: InseratTyp;
}

/** Ergebnis einer Kriterien-Suche für einen Typ (kauf oder miete). */
export interface PortalSuchErgebnis {
  typ: InseratTyp;
  inserate: Inserat[];
  /** Inserate ohne verwertbare Daten (z. B. Preis auf Anfrage, Neubauprojekte). */
  uebersprungen: number;
  /** Gesamttreffer laut Portal – kann größer sein als das, was wir laden. */
  gesamtTreffer: number;
}

/** Immobilienportal: kann zusätzlich zu fetch(url) eine Kriterien-Suche ausführen. */
export interface PortalAdapter extends SourceAdapter {
  /** Kurzname fürs UI, z. B. "willhaben.at". */
  readonly portal: string;
  /** Baut die Such-URLs zu den Kriterien und crawlt sie (ein Ergebnis pro URL/Typ). */
  sucheMitStatistik(kriterien: SuchKriterien): Promise<PortalSuchErgebnis[]>;
}
