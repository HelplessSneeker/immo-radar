import { PortalFehler, type PortalAdapter } from './adapters/portal-adapter.js';
import { bestandUpsert } from './db/bestand-repo.js';
import { sucheAbschliessen, sucheFehlgeschlagen } from './db/suchen-repo.js';
import { heutigesDatum } from './datum.js';
import { BUNDESLAENDER, filterInserate, type SuchKriterien } from './search.js';
import type { InseratMitPortal } from './types.js';

/** Ausführung eines Suchlaufs: Portale crawlen, filtern, Ergebnis persistieren. */

export interface CrawlErgebnis {
  inserate: InseratMitPortal[];
  quellen: string[];
}

/**
 * Fragt alle Portale ab und kombiniert die Inserate. Ein ausgefallenes Portal
 * degradiert nur zu einer Quellen-Zeile; erst wenn alle scheitern, wird der
 * erste PortalFehler geworfen.
 */
export async function crawlePortale(
  portale: PortalAdapter[],
  kriterien: SuchKriterien,
): Promise<CrawlErgebnis> {
  const region = BUNDESLAENDER[kriterien.bundesland] ?? kriterien.bundesland;

  const inserate: InseratMitPortal[] = [];
  const gesehen = new Set<string>();
  const quellen: string[] = [];
  const fehler: PortalFehler[] = [];
  // Dasselbe Objekt kann auf mehreren Portalen inseriert sein – wir kombinieren
  // bewusst ohne portal-übergreifende Deduplizierung (kein verlässlicher Schlüssel).
  for (const portal of portale) {
    let ergebnisse;
    try {
      ergebnisse = await portal.sucheMitStatistik(kriterien);
    } catch (e) {
      if (!(e instanceof PortalFehler)) throw e;
      fehler.push(e);
      quellen.push(`${portal.portal} ${region}: nicht abfragbar (${e.message})`);
      continue;
    }
    for (const ergebnis of ergebnisse) {
      for (const inserat of ergebnis.inserate) {
        if (!gesehen.has(inserat.id)) {
          gesehen.add(inserat.id);
          inserate.push({ ...inserat, portal: portal.portal });
        }
      }
      const uebersprungen =
        ergebnis.uebersprungen > 0 ? `, ${ergebnis.uebersprungen} ohne verwertbare Daten` : '';
      quellen.push(
        `${portal.portal} ${region} (${ergebnis.typ === 'kauf' ? 'Kauf' : 'Miete'}: ` +
          `${ergebnis.inserate.length} von ${ergebnis.gesamtTreffer} Inseraten geladen${uebersprungen})`,
      );
    }
  }
  if (fehler.length === portale.length) throw fehler[0]!;

  return { inserate, quellen };
}

let crawlKette: Promise<unknown> = Promise.resolve();

/**
 * Serialisiert Portal-Crawls prozessweit (FIFO): Scheduler und Ad-hoc-Suchen
 * erzeugen so nie gleichzeitigen Request-Druck auf die Portale. Fehler eines
 * Vorgängers brechen die Kette nicht.
 */
export function mitCrawlSperre<T>(fn: () => Promise<T>): Promise<T> {
  const ergebnis = crawlKette.catch(() => {}).then(fn);
  crawlKette = ergebnis.catch(() => {});
  return ergebnis;
}

/** Für Tests injizierbare Abhängigkeiten des Suchlaufs. */
export interface SuchlaufDeps {
  bestandUpsert: typeof bestandUpsert;
  sucheAbschliessen: typeof sucheAbschliessen;
  sucheFehlgeschlagen: typeof sucheFehlgeschlagen;
  heute: () => string;
}

const ECHTE_DEPS: SuchlaufDeps = {
  bestandUpsert,
  sucheAbschliessen,
  sucheFehlgeschlagen,
  heute: heutigesDatum,
};

/**
 * Startet den Suchlauf fire-and-forget: crawlt (unter der Crawl-Sperre),
 * schreibt die ungefilterten Inserate in den globalen Bestand, filtert und
 * schließt die Suche in der Datenbank ab; jeder Fehler landet als
 * status=fehlgeschlagen an der Suche. Ein Fehler beim Bestand-Upsert wird nur
 * geloggt – die Suche des Nutzers scheitert daran nicht. Der äußere Catch
 * darf selbst nie werfen – eine unbehandelte Rejection würde den Prozess
 * beenden. Die zurückgegebene Promise (nur für Tests) rejected daher nie.
 */
export function starteSuchlauf(
  sucheId: number,
  kriterien: SuchKriterien,
  portale: PortalAdapter[],
  deps: SuchlaufDeps = ECHTE_DEPS,
): Promise<void> {
  return (async () => {
    const { inserate, quellen } = await mitCrawlSperre(() => crawlePortale(portale, kriterien));
    try {
      await deps.bestandUpsert(inserate, kriterien.bundesland, deps.heute());
    } catch (e) {
      console.error(`Suche ${sucheId}: Bestand-Upsert fehlgeschlagen:`, e);
    }
    const treffer = filterInserate(inserate, kriterien);
    await deps.sucheAbschliessen(sucheId, quellen, treffer);
  })().catch(async (err: unknown) => {
    console.error(`Suche ${sucheId} fehlgeschlagen:`, err);
    const meldung =
      err instanceof PortalFehler
        ? `Kein Portal ist gerade abfragbar: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    try {
      await deps.sucheFehlgeschlagen(sucheId, meldung);
    } catch (dbErr) {
      console.error(`Suche ${sucheId}: Status konnte nicht gespeichert werden:`, dbErr);
    }
  });
}
