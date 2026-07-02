import process from 'node:process';
import { holePool, schliessePool } from './client.js';
import { wendeMigrationenAn } from './migrieren.js';

try {
  process.loadEnvFile();
} catch {
  // keine .env – DATABASE_URL kann auch direkt gesetzt sein
}

try {
  await wendeMigrationenAn(holePool());
  console.log('Migrationen sind aktuell.');
} finally {
  await schliessePool();
}
