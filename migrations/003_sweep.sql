-- Täglicher Kärnten-Sweep: ein Lauf pro Tag (UNIQUE lauf_datum ist der
-- Idempotenz-Anker, Claim per INSERT ... ON CONFLICT wie bei crawl_laeufe),
-- zerlegt in Segmente (Portal × Bezirk × Typ × optionales Preisband). Fertige
-- Segmente überleben einen Neustart: der wiederaufgenommene Tages-Sweep
-- überspringt sie und crawlt nur den Rest.

CREATE TABLE sweep_laeufe (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lauf_datum    DATE NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'laufend'
                CHECK (status IN ('laufend', 'fertig', 'fehlgeschlagen')),
  fehler        TEXT,              -- Meldung bei status=fehlgeschlagen
  inserate_gesehen INTEGER,        -- Summe upserteter Inserate über alle Segmente
  gestartet_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
  beendet_am    TIMESTAMPTZ
);

-- Bewusst lauf_datum statt Lauf-ID als Schlüsselteil: ein Retry-Lauf
-- desselben Tages erbt die fertigen Segmente. Ein Segment mit Preisband
-- (preis_min/preis_max) entsteht, wenn das Eltern-Segment die Portal-Caps
-- sättigt; "fertig" heißt: Segment samt aller Kind-Bänder abgeschlossen.
CREATE TABLE sweep_segmente (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lauf_datum    DATE NOT NULL,
  portal        TEXT NOT NULL,     -- z. B. 'willhaben.at'
  bezirk        TEXT NOT NULL,     -- schluessel aus BEZIRKE_KAERNTEN oder 'gesamt'
  typ           TEXT NOT NULL CHECK (typ IN ('kauf', 'miete')),
  preis_min     DOUBLE PRECISION,  -- NULL = nach unten offen
  preis_max     DOUBLE PRECISION,  -- NULL = nach oben offen
  status        TEXT NOT NULL DEFAULT 'laufend'
                CHECK (status IN ('laufend', 'fertig', 'fehlgeschlagen')),
  quelle        TEXT,              -- Statuszeile wie quellen[] der Suchläufe
  inserate_geladen INTEGER,
  gesamt_treffer   INTEGER,        -- laut Portal — Sättigungs-Diagnose
  gestartet_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
  beendet_am    TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (lauf_datum, portal, bezirk, typ, preis_min, preis_max)
);

CREATE INDEX sweep_segmente_datum_idx ON sweep_segmente (lauf_datum);
