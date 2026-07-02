import pg from 'pg';

/**
 * Lazy Pool-Singleton. Erst der erste Zugriff braucht DATABASE_URL – so
 * bleibt die CLI (die nichts aus src/db/ importiert) ohne Datenbank lauffähig.
 */

let pool: pg.Pool | undefined;

export function holePool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL ist nicht gesetzt. Postgres starten (pnpm db:up) und ' +
          '.env anlegen (siehe .env.example).',
      );
    }
    pool = new pg.Pool({ connectionString: url });
  }
  return pool;
}

/** Für Tests: Pool schließen und Singleton zurücksetzen. */
export async function schliessePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
