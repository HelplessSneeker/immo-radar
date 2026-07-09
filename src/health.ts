import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';

/** Strukturell statt pg.Pool, damit Tests einen Stub reinreichen können. */
export interface HealthPool {
  query(sql: string): Promise<unknown>;
}

export interface LetzterSweep {
  datum: string;
  beendetAm: Date;
}

export interface HealthDeps {
  pool: HealthPool;
  /** Version aus package.json — Boot-Zeit gelesen, s. paketVersion(). */
  version: string;
  /** Jüngster erfolgreicher Sweep. Fehler werden geschluckt (Bonus-Info). */
  letzterSweep?: () => Promise<LetzterSweep | undefined>;
  /** Deckel für die Sweep-Abfrage, damit /health nie hängt (Default 1 s). */
  letzterSweepTimeoutMs?: number;
}

/** Default-Deckel für die Sweep-Abfrage in /health. */
export const LETZTER_SWEEP_TIMEOUT_MS = 1000;

export interface HealthOk {
  status: 'ok';
  version: string;
  letzterSweep?: { datum: string; beendetAm: string };
}

/**
 * GET /health für den Coolify-Healthcheck: prüft die DB-Verbindung mit
 * SELECT 1 und meldet zusätzlich die Version und — falls erhebbar — den
 * jüngsten fertigen Sweep. Läuft vor dem Auth-Gate. Bei DB-Ausfall bleibt
 * die Antwort auf { status: "db-unreachable" } reduziert (kein Info-Leak).
 */
export async function behandleHealth(deps: HealthDeps, res: ServerResponse): Promise<void> {
  try {
    await deps.pool.query('SELECT 1');
  } catch {
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'db-unreachable' }));
    return;
  }
  const koerper: HealthOk = { status: 'ok', version: deps.version };
  if (deps.letzterSweep) {
    // Race mit Timeout: /health muss auch dann prompt antworten, wenn die
    // Sweep-Abfrage durch DB-Locks hängt — sonst kippt der Coolify-Healthcheck.
    const timeout = deps.letzterSweepTimeoutMs ?? LETZTER_SWEEP_TIMEOUT_MS;
    const abbruch = Symbol('sweep-timeout');
    try {
      const sweep = await Promise.race([
        deps.letzterSweep(),
        new Promise<typeof abbruch>((resolve) => setTimeout(() => resolve(abbruch), timeout)),
      ]);
      if (sweep !== abbruch && sweep !== undefined) {
        koerper.letzterSweep = {
          datum: sweep.datum,
          beendetAm: sweep.beendetAm.toISOString(),
        };
      }
    } catch {
      // Sweep-Info ist Bonus — bei DB-Fehler weglassen, nicht 503 auslösen.
    }
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(koerper));
}

/**
 * Version aus package.json, in beiden Layouts erreichbar: src/health.ts (tsx)
 * und dist/health.js (Runtime) liegen jeweils eine Ebene unter der
 * package.json. Wirft absichtlich beim Start, falls die Datei fehlt — das ist
 * ein Build-Fehler, keine Ausfallsituation zur Laufzeit.
 */
export function paketVersion(): string {
  const pfad = new URL('../package.json', import.meta.url);
  const inhalt = JSON.parse(readFileSync(pfad, 'utf-8')) as { version?: unknown };
  if (typeof inhalt.version !== 'string' || inhalt.version === '') {
    throw new Error('package.json ohne "version"-Feld — Build kaputt.');
  }
  return inhalt.version;
}
