import process from 'node:process';
import { KAERNTEN } from '../bezirke.js';
import { holePool, schliessePool } from './client.js';
import { wendeMigrationenAn } from './migrieren.js';
import { objekteRebuild } from './objekte-repo.js';

/**
 * Rebuild der Dedup-Schicht: pnpm objekte:rebuild — nach Änderungen an den
 * Matching-Regeln (src/matching.ts) oder für die Erst-Zuordnung des
 * historischen Bestands.
 */

try {
  process.loadEnvFile();
} catch {
  // keine .env – DATABASE_URL kann auch direkt gesetzt sein
}

try {
  await wendeMigrationenAn(holePool());
  const ergebnis = await objekteRebuild(KAERNTEN);
  console.log(
    `Rebuild fertig: ${ergebnis.zugeordnet} Inserate zu ${ergebnis.neueObjekte} Objekten zugeordnet.`,
  );
} finally {
  await schliessePool();
}
