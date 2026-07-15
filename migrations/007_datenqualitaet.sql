-- Harte Plausibilitätsregeln (src/plausibilitaet.ts): der Grund, warum ein
-- Inserat als Datenqualitäts-Ausreißer gilt, persistiert am Bestand.
ALTER TABLE inserate_bestand ADD COLUMN datenqualitaet TEXT NULL;
-- Kommagetrennte Ursachen wie "flaeche_ausreisser,zimmer_ratio_ausreisser".
-- NULL = plausibel; leerer String wird nie geschrieben.
CREATE INDEX inserate_bestand_datenqualitaet_idx
  ON inserate_bestand (datenqualitaet) WHERE datenqualitaet IS NOT NULL;
