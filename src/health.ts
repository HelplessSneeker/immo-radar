import type { ServerResponse } from 'node:http';

/** Strukturell statt pg.Pool, damit Tests einen Stub reinreichen können. */
export interface HealthPool {
  query(sql: string): Promise<unknown>;
}

/**
 * GET /health für den Coolify-Healthcheck: prüft die DB-Verbindung mit
 * SELECT 1. Läuft vor dem Auth-Gate – der Endpoint verrät nichts außer
 * ob die Datenbank erreichbar ist.
 */
export async function behandleHealth(pool: HealthPool, res: ServerResponse): Promise<void> {
  let status: number;
  let koerper: { status: string };
  try {
    await pool.query('SELECT 1');
    status = 200;
    koerper = { status: 'ok' };
  } catch {
    status = 503;
    koerper = { status: 'db-unreachable' };
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(koerper));
}
