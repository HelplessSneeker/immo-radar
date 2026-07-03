-- Beobachtungsgebiete (Watchlist), tägliche Crawl-Läufe und der globale,
-- historisierte Inseratsbestand. Der Bestand ist portalübergreifend bewusst
-- NICHT dedupliziert (kein verlässlicher Schlüssel); DATE-Spalten werden in
-- JS als ::text selektiert (siehe suchen-repo.ts).

CREATE TABLE gebiete (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,                -- Anzeigename, z. B. "Villach Zentrum"
  bundesland   TEXT NOT NULL,                -- Slug, siehe BUNDESLAENDER
  typ          TEXT NOT NULL DEFAULT 'beide' CHECK (typ IN ('kauf', 'miete', 'beide')),
  preis_min    DOUBLE PRECISION,
  preis_max    DOUBLE PRECISION,
  flaeche_min  DOUBLE PRECISION,
  flaeche_max  DOUBLE PRECISION,
  zimmer_min   DOUBLE PRECISION,
  zimmer_max   DOUBLE PRECISION,
  ort          TEXT,                         -- Freitext wie SuchKriterien.ort
  aktiv        BOOLEAN NOT NULL DEFAULT true,
  erstellt_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ein Crawl-Lauf pro Gebiet und Tag: UNIQUE (gebiet_id, lauf_datum) ist der
-- Idempotenz-Anker — der Scheduler beansprucht den Lauf atomar per
-- INSERT ... ON CONFLICT und crawlt nur bei Erfolg.
CREATE TABLE crawl_laeufe (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gebiet_id    INTEGER NOT NULL REFERENCES gebiete(id) ON DELETE CASCADE,
  lauf_datum   DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'laufend'
               CHECK (status IN ('laufend', 'fertig', 'fehlgeschlagen')),
  quellen      JSONB,          -- string[]: Quellen-Statuszeilen wie bei suchen
  fehler       TEXT,           -- Meldung bei status=fehlgeschlagen
  inserate_gesehen INTEGER,    -- Anzahl upserteter Inserate
  gestartet_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  beendet_am   TIMESTAMPTZ,
  UNIQUE (gebiet_id, lauf_datum)
);

-- Globaler historisierter Bestand: eine Zeile pro Portal-Inserat, über
-- Crawls hinweg fortgeschrieben. zuletzt_gesehen < letzter erfolgreicher
-- Lauf ⇒ delistet (Proxy für verkauft/vermietet).
CREATE TABLE inserate_bestand (
  portal          TEXT NOT NULL,             -- z. B. 'willhaben.at'
  inserat_id      TEXT NOT NULL,             -- Portal-ID (wh-…/is24-…)
  typ             TEXT NOT NULL CHECK (typ IN ('kauf', 'miete')),
  bundesland      TEXT NOT NULL,             -- Slug des Crawls, Scope für Gebiet-Abfragen
  ort             TEXT NOT NULL,
  plz             TEXT NOT NULL,
  bezirk          TEXT NOT NULL,
  preis           DOUBLE PRECISION NOT NULL, -- aktueller Preis
  flaeche_m2      DOUBLE PRECISION NOT NULL,
  zimmer          DOUBLE PRECISION NOT NULL,
  baujahr         INTEGER,
  zustand         TEXT,
  url             TEXT,
  datum_erfasst   DATE NOT NULL,
  zuerst_gesehen  DATE NOT NULL,
  zuletzt_gesehen DATE NOT NULL,
  PRIMARY KEY (portal, inserat_id)
);

CREATE INDEX inserate_bestand_gebiet_idx ON inserate_bestand (bundesland, zuletzt_gesehen);

-- Preisverlauf: eine Zeile beim ersten Sehen und je Preisänderung (max. eine
-- pro Tag, letzter Preis des Tages gewinnt) — so lässt sich der Preis zu
-- jedem Stichtag rekonstruieren.
CREATE TABLE preis_historie (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal      TEXT NOT NULL,
  inserat_id  TEXT NOT NULL,
  preis       DOUBLE PRECISION NOT NULL,
  erfasst_am  DATE NOT NULL,
  FOREIGN KEY (portal, inserat_id)
    REFERENCES inserate_bestand (portal, inserat_id) ON DELETE CASCADE,
  UNIQUE (portal, inserat_id, erfasst_am)
);
