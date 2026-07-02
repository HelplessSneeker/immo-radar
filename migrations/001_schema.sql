-- Suchläufe mit Lifecycle-Status und die zugehörigen (gefilterten) Treffer.
-- DOUBLE PRECISION/INTEGER statt NUMERIC/BIGINT: node-postgres liefert
-- letztere als Strings, die Domäne rechnet ohnehin in JS-Floats.

CREATE TABLE suchen (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'laufend'
               CHECK (status IN ('laufend', 'fertig', 'fehlgeschlagen')),
  bundesland   TEXT NOT NULL,
  typ          TEXT NOT NULL CHECK (typ IN ('kauf', 'miete', 'beide')),
  preis_min    DOUBLE PRECISION,
  preis_max    DOUBLE PRECISION,
  flaeche_min  DOUBLE PRECISION,
  flaeche_max  DOUBLE PRECISION,
  zimmer_min   DOUBLE PRECISION,
  zimmer_max   DOUBLE PRECISION,
  ort          TEXT,
  quellen      JSONB,          -- string[]: Quellen-Statuszeilen für den Report
  fehler       TEXT,           -- Meldung bei status=fehlgeschlagen
  erstellt_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
  beendet_am   TIMESTAMPTZ
);

CREATE TABLE inserate (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  suche_id      INTEGER NOT NULL REFERENCES suchen(id) ON DELETE CASCADE,
  inserat_id    TEXT NOT NULL,      -- Portal-ID, nur je Suche eindeutig
  typ           TEXT NOT NULL CHECK (typ IN ('kauf', 'miete')),
  ort           TEXT NOT NULL,
  plz           TEXT NOT NULL,
  bezirk        TEXT NOT NULL,
  preis         DOUBLE PRECISION NOT NULL,
  flaeche_m2    DOUBLE PRECISION NOT NULL,
  zimmer        DOUBLE PRECISION NOT NULL,
  baujahr       INTEGER,
  zustand       TEXT,
  url           TEXT,
  datum_erfasst DATE NOT NULL,
  UNIQUE (suche_id, inserat_id)
);

CREATE INDEX inserate_suche_idx ON inserate (suche_id);
