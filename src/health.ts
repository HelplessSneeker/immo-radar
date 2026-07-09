import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';

/** Strukturell statt pg.Pool, damit Tests einen Stub reinreichen können. */
export interface HealthPool {
  query(sql: string): Promise<unknown>;
}

export interface LetzterSweep {
  laufDatum: string;
  beendetAm: Date;
}

export interface HealthDeps {
  pool: HealthPool;
  /** Version aus package.json — Boot-Zeit gelesen, s. paketVersion(). */
  version: string;
  /** Hat der Aufrufer eine gültige Sitzung? Nur dann gibt es Details. */
  angemeldet: boolean;
  /** Jüngster erfolgreicher Sweep. Fehler werden geschluckt (Bonus-Info). */
  letzterSweep?: () => Promise<LetzterSweep | undefined>;
  /** Deckel für die Sweep-Abfrage, damit /health nie hängt (Default 1 s). */
  letzterSweepTimeoutMs?: number;
  /** Deckel für den SELECT-1-Check — hängt der Pool, gilt die DB als weg (Default 2 s). */
  dbTimeoutMs?: number;
}

/** Default-Deckel für die Sweep-Abfrage in /health. */
export const LETZTER_SWEEP_TIMEOUT_MS = 1000;

/** Default-Deckel für den SELECT-1-Check in /health. */
export const DB_TIMEOUT_MS = 2000;

export interface HealthOk {
  status: 'ok';
  version?: string;
  letzterSweep?: { laufDatum: string; beendetAm: string };
}

const ABGELAUFEN = Symbol('health-timeout');

/**
 * Race mit aufgeräumtem Timer: liefert ABGELAUFEN statt zu hängen. Bricht die
 * verlorene Abfrage nicht ab — der Aufrufer muss dafür sorgen, dass hängende
 * Abfragen nicht pro Healthcheck einen weiteren Pool-Client belegen
 * (s. Single-Flight in server.ts).
 */
async function mitZeitdeckel<T>(lauf: Promise<T>, ms: number): Promise<T | typeof ABGELAUFEN> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lauf,
      new Promise<typeof ABGELAUFEN>((resolve) => {
        timer = setTimeout(() => resolve(ABGELAUFEN), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health für den Coolify-Healthcheck: prüft die DB-Verbindung mit
 * SELECT 1, gedeckelt — ein hängender Pool zählt als db-unreachable statt den
 * Healthcheck kippen zu lassen. Läuft vor dem Auth-Gate und verrät anonym
 * nichts außer ob die Datenbank erreichbar ist; erst mit gültiger Sitzung
 * kommen Version und — falls erhebbar — der jüngste fertige Sweep dazu.
 */
export async function behandleHealth(deps: HealthDeps, res: ServerResponse): Promise<void> {
  let dbErreichbar: boolean;
  try {
    const probe = await mitZeitdeckel(deps.pool.query('SELECT 1'), deps.dbTimeoutMs ?? DB_TIMEOUT_MS);
    dbErreichbar = probe !== ABGELAUFEN;
  } catch {
    dbErreichbar = false;
  }
  if (!dbErreichbar) {
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'db-unreachable' }));
    return;
  }
  const koerper: HealthOk = { status: 'ok' };
  if (deps.angemeldet) {
    koerper.version = deps.version;
    if (deps.letzterSweep) {
      // Deckel: /health muss auch dann prompt antworten, wenn die Sweep-
      // Abfrage durch DB-Locks hängt — sonst kippt der Coolify-Healthcheck.
      try {
        const sweep = await mitZeitdeckel(
          deps.letzterSweep(),
          deps.letzterSweepTimeoutMs ?? LETZTER_SWEEP_TIMEOUT_MS,
        );
        if (sweep !== ABGELAUFEN && sweep !== undefined) {
          koerper.letzterSweep = {
            laufDatum: sweep.laufDatum,
            beendetAm: sweep.beendetAm.toISOString(),
          };
        }
      } catch {
        // Sweep-Info ist Bonus — bei DB-Fehler weglassen, nicht 503 auslösen.
      }
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
