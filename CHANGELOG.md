# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [1.0.0] - 2026-07-08

Erste produktionsreife Version: vom CLI-Report zum täglich crawlenden
Marktbeobachter mit eigenem Deploy.

### Hinzugefügt

- Täglicher Kärnten-Voll-Sweep über alle Bezirke und Preisbänder, mit
  Segment-Claims und Wiederaufnahme nach Abbruch (`bf2fda6`).
- Objekt-Deduplizierung: Inserate werden portal-übergreifend zu Objekten
  zusammengeführt, mit Preishistorie je Objekt (`bf2fda6`).
- Zeitreihen-Dashboard: Rendite, Miete/m² und Preis/m² je Bezirk über die
  Zeit, plus Inseratsbestand (`bf2fda6`).
- Portfolio mit Marktvergleich und Gebiete-Übersicht (`37dddfe`).
- Crawl-Ausbeute: Ort-Slugs, Flächen-/Zimmer-Kriterien in den Such-URLs,
  Portal-Ausfall-Marker (`693308f`).
- Coolify-Deploy: multi-stage Dockerfile, `/health`-Endpoint, fail-closed
  Basic-Auth, Graceful Shutdown, Migrations-Runner mit Advisory-Lock
  (`1c4152c`).
- Container-Härtung: Runtime läuft als unprivilegierter `node`-User;
  `RELEASE.md` mit Schritt-für-Schritt-Deploy-Ablauf.

## [0.1.0] - 2026-07-02

### Hinzugefügt

- CLI-Erstversion: Analyse von CSV/JSON-Inseratsdaten und Portal-Such-URLs,
  Rendering als HTML-Report (`43cc18e`).

[Unreleased]: https://github.com/HelplessSneeker/immo-radar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/HelplessSneeker/immo-radar/compare/43cc18e...v1.0.0
[0.1.0]: https://github.com/HelplessSneeker/immo-radar/commits/43cc18e
