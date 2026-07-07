-- Eigenes Portfolio: manuell gepflegte Wohnungen des Nutzers, bewusst
-- unabhängig vom Crawl (kein FK auf objekte/inserate_bestand) — die Objekte
-- existieren auch, wenn sie nirgends inseriert sind. Der Marktvergleich
-- (portfolio-vergleich.ts) läuft read-seitig über PLZ.

CREATE TABLE portfolio_objekte (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bezeichnung     TEXT NOT NULL,             -- z. B. "Wohnung Villacher Straße"
  plz             TEXT NOT NULL,
  ort             TEXT NOT NULL,
  kaufpreis       DOUBLE PRECISION NOT NULL, -- inkl. allem, was der Nutzer einrechnen will
  kaufdatum       DATE,
  miete_monat     DOUBLE PRECISION,          -- aktuelle Kaltmiete; NULL = leerstehend
  flaeche_m2      DOUBLE PRECISION NOT NULL,
  zimmer          DOUBLE PRECISION NOT NULL,
  baujahr         INTEGER,
  erstellt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
