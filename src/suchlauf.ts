import { PortalFehler, type PortalAdapter } from './adapters/portal-adapter.js';
import { sucheAbschliessen, sucheFehlgeschlagen } from './db/suchen-repo.js';
import { BUNDESLAENDER, filterInserate, type SuchKriterien } from './search.js';
import type { Inserat } from './types.js';

/** Ausführung eines Suchlaufs: Portale crawlen, filtern, Ergebnis persistieren. */

export interface CrawlErgebnis {
  inserate: Inserat[];
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

  const inserate: Inserat[] = [];
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
          inserate.push(inserat);
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

/**
 * Startet den Suchlauf fire-and-forget: crawlt, filtert und schließt die Suche
 * in der Datenbank ab; jeder Fehler landet als status=fehlgeschlagen an der
 * Suche. Der äußere Catch darf selbst nie werfen – eine unbehandelte Rejection
 * würde den Prozess beenden.
 */
export function starteSuchlauf(
  sucheId: number,
  kriterien: SuchKriterien,
  portale: PortalAdapter[],
): void {
  void (async () => {
    const { inserate, quellen } = await crawlePortale(portale, kriterien);
    const treffer = filterInserate(inserate, kriterien);
    await sucheAbschliessen(sucheId, quellen, treffer);
  })().catch(async (err: unknown) => {
    console.error(`Suche ${sucheId} fehlgeschlagen:`, err);
    const meldung =
      err instanceof PortalFehler
        ? `Kein Portal ist gerade abfragbar: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    try {
      await sucheFehlgeschlagen(sucheId, meldung);
    } catch (dbErr) {
      console.error(`Suche ${sucheId}: Status konnte nicht gespeichert werden:`, dbErr);
    }
  });
}
