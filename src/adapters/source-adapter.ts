import type { Inserat } from '../types.js';

/**
 * Austauschbare Datenquelle für Inserate.
 *
 * V1 implementiert nur den Datei-Import (CSV/JSON). Ein späterer
 * Scraper-Adapter implementiert dasselbe Interface: `source` ist dann
 * z. B. eine Such-URL statt eines Dateipfads, `fetch` darf beliebig
 * asynchron arbeiten (HTTP, Rate-Limiting, Pagination).
 */
export interface SourceAdapter {
  /** Anzeigename der Quelle, erscheint in Fehlermeldungen und im Report. */
  readonly name: string;

  /** Ob dieser Adapter die angegebene Quelle verarbeiten kann. */
  canHandle(source: string): boolean;

  /** Lädt und validiert alle Inserate der Quelle. Wirft bei ungültigen Daten. */
  fetch(source: string): Promise<Inserat[]>;
}

/** Wählt den ersten passenden Adapter für eine Quelle. */
export function resolveAdapter(adapters: SourceAdapter[], source: string): SourceAdapter {
  const adapter = adapters.find((a) => a.canHandle(source));
  if (!adapter) {
    throw new Error(`Keine Datenquelle kann "${source}" verarbeiten.`);
  }
  return adapter;
}
