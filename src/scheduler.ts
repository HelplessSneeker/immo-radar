import type { PortalAdapter } from './adapters/portal-adapter.js';
import { fuehreSweepAus } from './sweep.js';

/**
 * Zeitgesteuerter täglicher Kärnten-Sweep: der Timer tickt öfter, aber der
 * DB-Claim in sweep_laeufe macht die Läufe idempotent – ein Neustart oder
 * zweiter Tick sweept nie doppelt.
 */

const TICK_MS_DEFAULT = 30 * 60 * 1000;

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
    if (tickLaeuft) return; // Claim verhindert Doppel-Sweeps, der Guard spart nur Arbeit
    tickLaeuft = true;
    void fuehreSweepAus(portale)
      .catch((err: unknown) => {
        console.error('Sweep-Tick fehlgeschlagen:', err);
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
