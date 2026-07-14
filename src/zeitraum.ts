import { minusTage } from './datum.js';

/**
 * Der Zeitraum-Filter des Dashboards: Presets relativ zum letzten Sweep
 * oder ein absolutes Von/Bis-Paar. Eigenes Modul, damit search.ts (Parser)
 * und server.ts (Grenzen-Berechnung) die Typen teilen, ohne dass search.ts
 * und trend.ts sich gegenseitig importieren müssen.
 */

export type ZeitraumPreset = '7d' | '30d' | '90d' | 'alle';

export interface ZeitraumFilter {
  preset?: ZeitraumPreset;
  /** ISO YYYY-MM-DD; nur bei Custom gesetzt, immer paarweise (von <= bis). */
  von?: string;
  bis?: string;
}

/** Fenstergröße je Preset in Tagen (inklusive beider Enden). */
const PRESET_TAGE: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Zeitraum-Filter in inklusive Datumsgrenzen übersetzen. Referenz ist immer
 * der letzte Sweep (sweep.laufDatum), nie "heute" — sonst wären Presets
 * nicht reproduzierbar. undefined = kein Klemmen (Zeitraum "Alle").
 *
 * Custom-Grenzen: bis wird auf den Referenz-Tag geklemmt (Zukunftsschutz).
 * Liegt von hinter dem geklemmten bis (Zeitraum komplett in der Zukunft),
 * beschreibt das Ergebnis ein leeres Fenster — das Klemmen liefert dann
 * keine Stichtage und die Seite zeigt ehrlich den Leer-Zustand, statt still
 * die volle Historie unter einem sichtbar aktiven Filter zu rendern.
 */
export function zeitraumZuGrenzen(
  filter: ZeitraumFilter | undefined,
  referenzTag: string,
): { von: string; bis: string } | undefined {
  if (filter === undefined) return undefined;

  if (filter.von !== undefined && filter.bis !== undefined) {
    const bis = filter.bis < referenzTag ? filter.bis : referenzTag;
    return { von: filter.von, bis };
  }

  if (filter.preset === undefined || filter.preset === 'alle') return undefined;
  const tage = PRESET_TAGE[filter.preset];
  return { von: minusTage(referenzTag, tage - 1), bis: referenzTag };
}
