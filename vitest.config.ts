import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Die DB-Integrationstests truncaten teils dieselben Tabellen
    // (inserate_bestand) — parallele Testdateien würden sich die Daten
    // gegenseitig wegräumen. Die Suite ist klein genug, um seriell zu laufen.
    fileParallelism: false,
  },
});
