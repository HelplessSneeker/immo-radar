import type { PortalAdapter } from './adapters/portal-adapter.js';
import { bestandUpsert } from './db/bestand-repo.js';
import {
  crawlLaufAbschliessen,
  crawlLaufBeanspruchen,
  crawlLaufErzwingen,
  crawlLaufFehlgeschlagen,
  gebieteAuflisten,
  type Gebiet,
} from './db/gebiete-repo.js';
import { heutigesDatum } from './datum.js';
import { crawlePortale, mitCrawlSperre } from './suchlauf.js';

/**
 * Zeitgesteuerter Crawl der Beobachtungsgebiete: pro Gebiet und Tag genau ein
 * erfolgreicher Lauf. Der Timer tickt öfter, aber der DB-Claim in
 * crawl_laeufe macht die Läufe idempotent – ein Neustart oder zweiter Tick
 * crawlt nie doppelt.
 */

/** Für Tests injizierbare Abhängigkeiten. */
export interface SchedulerDeps {
  gebieteAuflisten: typeof gebieteAuflisten;
  crawlLaufBeanspruchen: typeof crawlLaufBeanspruchen;
  crawlLaufErzwingen: typeof crawlLaufErzwingen;
  crawlLaufAbschliessen: typeof crawlLaufAbschliessen;
  crawlLaufFehlgeschlagen: typeof crawlLaufFehlgeschlagen;
  crawlePortale: typeof crawlePortale;
  bestandUpsert: typeof bestandUpsert;
  mitCrawlSperre: typeof mitCrawlSperre;
  heute: () => string;
}

const ECHTE_DEPS: SchedulerDeps = {
  gebieteAuflisten,
  crawlLaufBeanspruchen,
  crawlLaufErzwingen,
  crawlLaufAbschliessen,
  crawlLaufFehlgeschlagen,
  crawlePortale,
  bestandUpsert,
  mitCrawlSperre,
  heute: heutigesDatum,
};

const TICK_MS_DEFAULT = 30 * 60 * 1000;

/** Crawlt ein Gebiet mit bereits beanspruchtem Lauf. Wirft nie. */
async function crawlGebiet(
  gebiet: Gebiet,
  laufId: number,
  portale: PortalAdapter[],
  deps: SchedulerDeps,
): Promise<void> {
  try {
    // Immer Kauf & Miete crawlen – der Gebiet-Typ filtert nur die Auswertung.
    const kriterien = { ...gebiet.kriterien, typ: 'beide' as const };
    const { inserate, quellen } = await deps.mitCrawlSperre(() =>
      deps.crawlePortale(portale, kriterien),
    );
    await deps.bestandUpsert(inserate, gebiet.kriterien.bundesland, deps.heute());
    await deps.crawlLaufAbschliessen(laufId, quellen, inserate.length);
    console.log(`Gebiet "${gebiet.name}": ${inserate.length} Inserate im Bestand aktualisiert.`);
  } catch (err) {
    console.error(`Gebiet "${gebiet.name}": Crawl fehlgeschlagen:`, err);
    const meldung = err instanceof Error ? err.message : String(err);
    try {
      await deps.crawlLaufFehlgeschlagen(laufId, meldung);
    } catch (dbErr) {
      console.error(`Gebiet "${gebiet.name}": Status konnte nicht gespeichert werden:`, dbErr);
    }
  }
}

/**
 * Ein Tick: crawlt alle aktiven Gebiete strikt sequenziell, deren heutiger
 * Lauf noch aussteht. Ein fehlgeschlagenes Gebiet stoppt die anderen nicht.
 */
export async function crawlAlleGebiete(
  portale: PortalAdapter[],
  deps: SchedulerDeps = ECHTE_DEPS,
): Promise<void> {
  const gebiete = await deps.gebieteAuflisten(true);
  for (const gebiet of gebiete) {
    const laufId = await deps.crawlLaufBeanspruchen(gebiet.id, deps.heute());
    if (laufId === undefined) continue; // heute schon gecrawlt oder läuft gerade
    await crawlGebiet(gebiet, laufId, portale, deps);
  }
}

/**
 * Manueller "Jetzt crawlen"-Trigger: erzwingt den heutigen Lauf (auch wenn
 * schon fertig) und crawlt im Hintergrund. Liefert false, wenn gerade ein
 * Lauf dieses Gebiets läuft – dann passiert nichts.
 */
export async function starteGebietCrawl(
  gebiet: Gebiet,
  portale: PortalAdapter[],
  deps: SchedulerDeps = ECHTE_DEPS,
): Promise<boolean> {
  const laufId = await deps.crawlLaufErzwingen(gebiet.id, deps.heute());
  if (laufId === undefined) return false;
  void crawlGebiet(gebiet, laufId, portale, deps); // wirft nie (fire-and-forget)
  return true;
}

/**
 * Startet den Zeitplan: sofortiger erster Tick (Catch-up nach Neustart),
 * danach alle `tickMs` (Default 30 min, Env-Override CRAWL_TICK_MS). Der
 * äußere Catch darf nie werfen – eine unbehandelte Rejection würde den
 * Prozess beenden.
 */
export function starteZeitplan(
  portale: PortalAdapter[],
  tickMs = Number(process.env.CRAWL_TICK_MS ?? TICK_MS_DEFAULT),
): { stop(): void } {
  let tickLaeuft = false;
  const tick = (): void => {
    if (tickLaeuft) return; // Claim verhindert Doppel-Crawls, der Guard spart nur Arbeit
    tickLaeuft = true;
    void crawlAlleGebiete(portale)
      .catch((err: unknown) => {
        console.error('Gebiet-Crawl-Tick fehlgeschlagen:', err);
      })
      .finally(() => {
        tickLaeuft = false;
      });
  };

  tick();
  const timer = setInterval(tick, tickMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
