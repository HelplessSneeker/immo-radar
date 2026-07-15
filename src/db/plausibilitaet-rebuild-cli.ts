import process from 'node:process';
import { plausibilitaetRebuild } from './bestand-repo.js';
import { holePool, schliessePool } from './client.js';
import { wendeMigrationenAn } from './migrieren.js';

/**
 * Re-Evaluation der Hard-Plausibilitätsregeln: pnpm plausibilitaet:rebuild —
 * einmalig nach Migration 007 bzw. nach Grenzen-Änderungen in
 * src/plausibilitaet.ts. Idempotent, mehrfach ausführbar.
 */

try {
  process.loadEnvFile();
} catch {
  // keine .env – DATABASE_URL kann auch direkt gesetzt sein
}

try {
  await wendeMigrationenAn(holePool());
  const stand = await plausibilitaetRebuild({
    onFortschritt: (s) =>
      console.log(
        `… ${s.geprueft} geprüft, ${s.geflaggt} geflaggt, ${s.entflaggt} entflaggt, ${s.unveraendert} unverändert`,
      ),
  });
  console.log(
    `Rebuild fertig: ${stand.geprueft} geprüft, ${stand.geflaggt} geflaggt, ` +
      `${stand.entflaggt} entflaggt, ${stand.unveraendert} unverändert.`,
  );
} finally {
  await schliessePool();
}
