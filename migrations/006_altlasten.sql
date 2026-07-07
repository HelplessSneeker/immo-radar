-- Rückbau der alten Welt (Ad-hoc-Suche + Beobachtungsgebiete): das
-- Dashboard über den täglichen Kärnten-Sweep ersetzt beides. Der
-- historisierte Bestand (inserate_bestand, preis_historie) und die
-- Dedup-Schicht (objekte) bleiben vollständig erhalten — sie speisen alle
-- Zeitreihen. sweep_laeufe/sweep_segmente ersetzen crawl_laeufe operativ.

DROP TABLE inserate;      -- Treffer der Ad-hoc-Suchen (FK auf suchen)
DROP TABLE suchen;
DROP TABLE crawl_laeufe;  -- Gebiet-Crawls (FK auf gebiete)
DROP TABLE gebiete;
