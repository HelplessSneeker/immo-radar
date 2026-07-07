-- Dedup-Schicht: ein "Objekt" ist die eine Wohnung, auf die 1..n
-- Portal-Inserate zeigen (Cross-Portal-Duplikate und Wiedereinstellungen,
-- Regeln in src/matching.ts). Die Roh-Inserate bleiben unangetastet — die
-- Zuordnung ist eine nullbare Spalte, jede (Ent-)Zuordnung landet im
-- Audit-Log. Ein Rebuild (pnpm objekte:rebuild) leert die Schicht und
-- ordnet deterministisch neu zu.

CREATE TABLE objekte (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  typ          TEXT NOT NULL CHECK (typ IN ('kauf', 'miete')),
  plz          TEXT NOT NULL,             -- normalisiert (4-stellig, siehe normalisierung.ts)
  ort          TEXT NOT NULL,             -- kanonischer Anzeigename
  bezirk       TEXT NOT NULL,
  flaeche_m2   DOUBLE PRECISION NOT NULL, -- kanonische Attribute vom ältesten Inserat
  zimmer       DOUBLE PRECISION NOT NULL,
  baujahr      INTEGER,
  erstellt_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX objekte_block_idx ON objekte (typ, plz);

ALTER TABLE inserate_bestand
  ADD COLUMN objekt_id INTEGER REFERENCES objekte(id) ON DELETE SET NULL;

CREATE INDEX inserate_bestand_objekt_idx ON inserate_bestand (objekt_id);

-- Audit-Log: welche Regel hat wann welches Inserat (ent-)zugeordnet.
-- Bewusst ohne FK auf objekte — das Log überlebt einen Rebuild.
CREATE TABLE objekt_zuordnungen (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objekt_id   INTEGER NOT NULL,
  portal      TEXT NOT NULL,
  inserat_id  TEXT NOT NULL,
  aktion      TEXT NOT NULL CHECK (aktion IN ('zugeordnet', 'geloest')),
  regel       TEXT NOT NULL CHECK (regel IN ('neu', 'duplikat', 'relisting')),
  details     JSONB,                      -- Toleranzen/Deltas, rebuild-Flag
  erfasst_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);
