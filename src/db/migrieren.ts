import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

/**
 * Minimaler Migrations-Runner: nummerierte .sql-Dateien in migrations/,
 * Buchhaltung in der Tabelle "migrationen". Läuft beim Serverstart und
 * über `pnpm db:migrate`; ein Advisory-Lock schützt gegen eine versehentlich
 * parallel gestartete zweite Instanz.
 */

// Funktioniert aus src/db/ (tsx) und dist/db/ (kompiliert) – migrations/
// liegt in beiden Fällen zwei Ebenen über dieser Datei im Projektwurzel.
const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

const LOCK_ID = 72_461_001; // beliebig, nur projektintern eindeutig

export function migrationsVersion(dateiname: string): number {
  const n = Number.parseInt(dateiname, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Migrationsdatei "${dateiname}" beginnt nicht mit einer Nummer.`);
  }
  return n;
}

export async function wendeMigrationenAn(pool: pg.Pool): Promise<void> {
  const dateien = (await readdir(MIGRATIONS_DIR))
    .filter((d) => d.endsWith('.sql'))
    .sort((a, b) => migrationsVersion(a) - migrationsVersion(b));

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS migrationen (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      angewendet_am TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ version: number }>('SELECT version FROM migrationen');
    const angewendet = new Set(rows.map((r) => r.version));

    for (const datei of dateien) {
      const version = migrationsVersion(datei);
      if (angewendet.has(version)) continue;
      const sql = await readFile(new URL(datei, MIGRATIONS_DIR), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrationen (version, name) VALUES ($1, $2)', [
          version,
          datei,
        ]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
      console.log(`Migration angewendet: ${datei}`);
    }
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
  } finally {
    client.release();
  }
}
