-- Strukturierte Kategorie-Felder von den Portal-Detailseiten, genau eine
-- Zeile pro (portal, inserat_id). Die Zeile ist zugleich der Fetch-Cache:
-- existiert sie, wird die Detailseite nie erneut geladen (Cache-Miss =
-- Anti-Join über den PK). Kategorie-Felder nullable — Portale liefern sie
-- nicht immer; detail_geholt_am dokumentiert den Fetch-Zeitpunkt.
CREATE TABLE inserat_details (
  portal           TEXT NOT NULL,             -- z. B. 'willhaben.at'
  inserat_id       TEXT NOT NULL,             -- Portal-ID (wh-…/is24-…)
  baujahr          INTEGER,
  zustand          TEXT,                      -- z. B. "Erstbezug", "sehr gut"
  baustil          TEXT,                      -- Gebäudetyp (BUILDING_TYPE)
  heizung          TEXT,
  ausstattung      JSONB,                     -- string[], z. B. Balkon/Garten/Lift
  energie_hwb      DOUBLE PRECISION,          -- kWh/m²a
  energie_fgee     DOUBLE PRECISION,
  beschreibung     TEXT,
  detail_geholt_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (portal, inserat_id),
  FOREIGN KEY (portal, inserat_id)
    REFERENCES inserate_bestand (portal, inserat_id) ON DELETE CASCADE
);
-- Kein zusätzlicher Index: der Cache-Miss-Lookup ist ein Anti-Join über
-- exakt (portal, inserat_id) — der implizite Unique-Index des PK deckt ihn
-- ab; die Bestand-Seite filtert über inserate_bestand_gebiet_idx.
