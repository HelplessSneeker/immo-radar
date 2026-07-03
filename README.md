# immo-radar

Immobilienmarkt-Analyse für Anlageobjekte in Österreich. Lädt Kauf- und
Miet-Inserate (live von willhaben.at und immoscout24.at oder aus
CSV-/JSON-Dateien), wertet sie pro Gebiet aus und erzeugt einen HTML-Report
mit Vergleichstabelle, Diagrammen und Brutto-Renditeübersicht. Über
Beobachtungsgebiete baut der Server zusätzlich einen historisierten
Inseratsbestand auf (Preisentwicklung, Vermarktungsdauer, Preissenkungen).

## Voraussetzungen

- Node.js ≥ 20
- pnpm
- PostgreSQL für den Suchserver (lokal am einfachsten via Docker Compose);
  die CLI braucht keine Datenbank

## Suchserver (empfohlener Einstieg)

```sh
pnpm install
pnpm db:up            # startet Postgres via Docker Compose
cp .env.example .env  # DATABASE_URL (Standard passt zum Compose-Setup)
pnpm serve            # wendet Migrationen automatisch an
```

Dann <http://localhost:8787> im Browser öffnen (Port über die Umgebungsvariable
`PORT` änderbar). Die Startseite ist die Beobachtungsgebiete-Übersicht — das
Herzstück der Anwendung; die Ad-hoc-Suche liegt unter `/suche` und dient der
schnellen Markteinschätzung. Die Suchseite fragt Bundesland, Kauf/Miete,
Preis-, Flächen- und Zimmerbereich sowie optional Ort/PLZ/Bezirk ab. Beim
Absenden legt der Server einen Suchlauf in der Datenbank an und crawlt im
Hintergrund live willhaben.at und immoscout24.at (nur Wohnungen, max. ≈150
bzw. ≈75 Inserate pro Segment, sequentiell mit Pause — die Suche dauert
einige Sekunden). Der Browser landet sofort auf `/suchen/<id>`, die Seite
aktualisiert sich selbst und zeigt den Analyse-Report, sobald der Suchlauf
fertig ist.

### Suchhistorie

Jede Suche wird mit Kriterien, Status (läuft / fertig / fehlgeschlagen) und
den gefundenen Inseraten in Postgres gespeichert:

- Die Suchseite (`/suche`) zeigt die letzten 10 Suchen, `/suchen` die komplette Historie.
- `/suchen/<id>` ist eine dauerhafte URL — der Report wird beim Aufruf aus den
  gespeicherten Inseraten neu berechnet, ohne erneuten Crawl.
- Wird der Server während eines Suchlaufs neu gestartet, markiert er die
  unterbrochene Suche beim nächsten Start als fehlgeschlagen.

Migrationen (nummerierte SQL-Dateien in `migrations/`) laufen beim Serverstart
automatisch; `pnpm db:migrate` wendet sie manuell an.

### Beobachtungsgebiete & historisierter Bestand

Auf der Startseite (`/`; alte `/gebiete`-Lesezeichen werden umgeleitet)
lassen sich Beobachtungsgebiete anlegen (Name + dieselben Kriterien wie die
Suche); die Übersicht zeigt je Gebiet, wann zuletzt erfolgreich gecrawlt
wurde — überfällige oder nie gecrawlte aktive Gebiete sind markiert. Aktive Gebiete crawlt der Server **einmal täglich**
automatisch (Scheduler-Tick alle 30 Minuten, Override per `CRAWL_TICK_MS`;
pro Gebiet und Tag läuft höchstens ein Crawl — das stellt ein DB-Claim in
`crawl_laeufe` sicher, auch über Neustarts und mehrere Ticks hinweg).
Der Button „jetzt crawlen" stößt einen Crawl sofort manuell an — auch wenn
der heutige Lauf schon fertig ist (praktisch zum Testen); nur ein gerade
laufender Crawl wird nicht doppelt gestartet.

Die Crawls schreiben **ungefiltert** in einen globalen, historisierten
Bestand (`inserate_bestand`, Schlüssel Portal + Inserats-ID) mit
`zuerst_gesehen`/`zuletzt_gesehen` und einer Preishistorie (eine Zeile beim
ersten Sehen und je Preisänderung). Auch jede Ad-hoc-Suche füttert diesen
Bestand nebenbei. Gebiet-Typ und Kriterien filtern erst beim Lesen.

`/gebiete/<id>` wertet den Bestand aus: aktive vs. delistete Inserate
(delistet = im letzten erfolgreichen Lauf nicht mehr gesehen — Proxy für
verkauft/vermietet), Median-Vermarktungsdauer, Zeitreihe Median €/m²
(Kauf/Miete, Wochenraster) sowie die Inserat-Tabellen: alle aktiven Inserate
(mit €/m², „zuerst gesehen"/Tage online und letzter Preisänderung aus der
Preishistorie; ab 50 Zeilen gekürzt, `?inserate=alle` zeigt alles) und die
kürzlich delisteten Inserate der letzten 14 Tage.
`/gebiete/<id>/report` rechnet den gewohnten Marktreport über den aktiven
Snapshot. **Tipp:** Gebiete eng fassen (Ort/Bezirk statt ganzem Bundesland) —
die Portal-Caps (~150/~75 Inserate pro Segment) machen große Gebiete zur
Stichprobe; Preisfenster großzügig wählen, sonst gelten Inserate nach einer
Preisänderung aus dem Fenster als delistet.

**Hinweise:** Für die Rendite-Berechnung braucht ein Ort sowohl Kauf- als
auch Mietinserate — Typ „beide" ist daher der Standard. Die Crawler lesen das
in den Suchseiten eingebettete JSON; ändert ein Portal den Seitenaufbau,
degradiert die Suche (das Portal erscheint als „nicht abfragbar" im Report);
erst wenn alle Portale scheitern, antwortet der Server mit einer klaren
Fehlermeldung (502) statt mit falschen Daten. Dasselbe Objekt kann auf beiden
Portalen inseriert sein und dann doppelt zählen — eine portal-übergreifende
Deduplizierung gibt es mangels verlässlichen Schlüssels nicht. Scraping
verstößt formal gegen die Portal-AGB — das Tool ist für private, moderate
Nutzung gedacht.

## CLI (CSV/JSON-Dateien oder Portal-Such-URLs)

```sh
# Direkt aus dem Quellcode (Entwicklung):
pnpm analyze --input daten/*.csv --out report.html

# Auch Portal-Such-URLs sind gültige Quellen:
pnpm analyze --input "https://www.willhaben.at/iad/immobilien/eigentumswohnung/kaernten"
pnpm analyze --input "https://www.immoscout24.at/regional/kaernten/wohnung-kaufen"

# Oder gebaut als CLI:
pnpm build
node bin/immo-radar.js analyze --input daten/*.csv --out report.html
```

Danach `report.html` im Browser öffnen. Die Diagramme laden Chart.js über
CDN — beim Öffnen des Reports ist daher eine Internetverbindung nötig; ohne
Verbindung zeigt der Report einen Hinweis, alle Werte stehen zusätzlich in
den Tabellen.

Mitgelieferte Beispieldaten: `daten/inserate-kaernten.csv`
(20 Inserate: Klagenfurt, Villach, Feldkirchen).

### Optionen

| Option | Bedeutung |
|---|---|
| `--input <datei ...>` | Eine oder mehrere CSV-/JSON-Dateien (Globs expandiert die Shell) |
| `--out <datei>` | Zieldatei für den Report (Standard: `report.html`) |

## CSV-Format

Erste Zeile ist der Header. Spaltenreihenfolge ist egal, unbekannte Spalten
sind ein Fehler (Tippfehler-Schutz). Felder mit Komma (z. B. Dezimal-Komma)
in doppelte Anführungszeichen setzen.

| Spalte | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Eindeutige Kennung des Inserats |
| `typ` | ja | `kauf` oder `miete` |
| `ort` | ja | Ort — definiert das Gebiet für die Auswertung |
| `plz` | ja | Postleitzahl |
| `bezirk` | ja | Politischer Bezirk |
| `preis` | ja | Kaufpreis in € bzw. monatliche **Kaltmiete** in € |
| `flaeche_m2` | ja | Wohnfläche in m² (Dezimal-Komma oder -Punkt) |
| `zimmer` | ja | Zimmeranzahl |
| `baujahr` | nein | Baujahr |
| `zustand` | nein | Freitext, z. B. `saniert`, `renovierungsbedürftig` |
| `url` | nein | Link zum Original-Inserat |
| `datum_erfasst` | ja | Erfassungsdatum, `YYYY-MM-DD` |

Beispiel:

```csv
id,typ,ort,plz,bezirk,preis,flaeche_m2,zimmer,baujahr,zustand,url,datum_erfasst
KL-K1,kauf,Klagenfurt,9020,Klagenfurt Stadt,165000,52,2,1985,saniert,https://example.at/inserat/kl-k1,2026-06-12
KL-M1,miete,Klagenfurt,9020,Klagenfurt Stadt,560,54,2,1990,gepflegt,,2026-06-12
```

JSON-Dateien enthalten ein Array von Objekten mit denselben Feldern.

## Was der Report zeigt

- **Brutto-Mietrendite pro Gebiet** = (Median-Kaltmiete €/m² × 12) /
  Median-Kaufpreis €/m²; Gebiete ≥ 4 % sind hervorgehoben.
- **Vergleichstabelle**: Anzahl, Median, Durchschnitt, Min–Max der €/m² —
  getrennt nach Kauf und Miete.
- **Balkendiagramme**: Median €/m² Kauf und Miete pro Gebiet (zwei Panels,
  da die Skalen ~300× auseinanderliegen).
- **Scatterplots** Fläche vs. Preis (Kauf und Miete getrennt), Ausreißer
  als rote Raute markiert.
- **Inseratsliste** mit €/m² und Ausreißer-Kennzeichnung.

**Methodik:** Median/Quartile mit linearer Interpolation (R-7). Ausreißer =
€/m² außerhalb von Q1 − 1,5×IQR bzw. Q3 + 1,5×IQR, je Gebiet und Typ
berechnet (erst ab 4 Inseraten bewertet). Die Bruttorendite ignoriert
Betriebskosten, Leerstand und Kaufnebenkosten — Nettorendite ist V2.

## Entwicklung

```sh
pnpm test            # Vitest (Statistik, Parsing, Portal-Mappings, Crawler)
pnpm typecheck       # tsc --noEmit
pnpm build           # kompiliert nach dist/
```

Die Crawler-Tests laufen komplett offline gegen eingecheckte Fixtures
(`tests/fixtures/willhaben-next-data.json`,
`tests/fixtures/immoscout24-initial-state.html`) und ein injiziertes
Fake-`fetch` — CI braucht kein Netz. Die Datenbank-Integrationstests
(`tests/db.integration.test.ts`) laufen nur, wenn `DATABASE_URL` gesetzt ist
(z. B. `DATABASE_URL=postgres://immo:immo@localhost:5432/immo pnpm test`);
ohne Datenbank werden sie übersprungen und `pnpm test` bleibt grün.

### Architektur

Datenquellen sind hinter dem `SourceAdapter`-Interface gekapselt
(`src/adapters/source-adapter.ts`): `FileAdapter` (CSV/JSON) sowie
`WillhabenAdapter` und `ImmoScout24Adapter` (Live-Crawl, Quelle =
Portal-Such-URL). Die Portal-Adapter implementieren zusätzlich das
`PortalAdapter`-Interface (`src/adapters/portal-adapter.ts`) mit
`sucheMitStatistik(kriterien)` — darüber fragt der Server alle Portale
kombiniert ab. Ein weiteres Portal (z. B. immowelt.at) braucht nur
`src/<portal>/{map,url}.ts` + einen Adapter und wird in `src/cli.ts` bzw.
`src/server.ts` registriert — sonst ändert sich nichts.

```
src/
  types.ts                  Datenmodell (Inserat)
  parse.ts                  CSV-/JSON-Parsing + Validierung (pure Funktionen)
  adapters/source-adapter.ts  SourceAdapter-Interface + Auflösung
  adapters/portal-adapter.ts  PortalAdapter-Interface + PortalFehler
  adapters/file-adapter.ts    Datei-Import (CSV/JSON)
  adapters/willhaben-adapter.ts  Live-Crawl willhaben.at (Pagination, Dedupe)
  adapters/immoscout24-adapter.ts  Live-Crawl immoscout24.at (Pagination, Dedupe)
  willhaben/map.ts          __NEXT_DATA__-Extraktion, Mapping auf Inserat
  willhaben/url.ts          Suchkriterien → willhaben-Such-URLs
  immoscout24/map.ts        __INITIAL_STATE__-Extraktion, Mapping auf Inserat
  immoscout24/url.ts        Suchkriterien → immoscout24-Such-URLs
  search.ts                 Suchkriterien parsen/validieren + Trefferfilter
  datum.ts                  Datums-Helfer (YYYY-MM-DD, UTC)
  stats.ts                  Median, Quantile, IQR-Ausreißer, Bruttorendite
  analyze.ts                Gruppierung nach Gebiet, Kennzahlen
  trend.ts                  Zeitreihen über den Bestand (Median €/m², Vermarktungsdauer, Preissenkungen)
  report.ts                 HTML-Report (Chart.js via CDN)
  suchlauf.ts               Portal-Crawl, Crawl-Sperre + Hintergrund-Ausführung eines Suchlaufs
  scheduler.ts              Täglicher Crawl der Beobachtungsgebiete (DB-Claim als Idempotenz-Anker)
  db/client.ts              Lazy Postgres-Pool (braucht DATABASE_URL)
  db/migrieren.ts           Migrations-Runner (migrations/*.sql)
  db/suchen-repo.ts         Persistenz der Suchläufe und Treffer
  db/bestand-repo.ts        Globaler historisierter Inseratsbestand + Preishistorie
  db/gebiete-repo.ts        Beobachtungsgebiete + Crawl-Läufe (Claim)
  pages/layout.ts           Gemeinsames Seitengerüst + CSS
  pages/search-page.ts      Suchformular + Fehler-/Keine-Treffer-Seiten
  pages/suchen-pages.ts     Polling-Seite, Historie, Fehlgeschlagen-Seite
  pages/gebiete-pages.ts    Gebiete-Verwaltung + Auswertungsseite (Trends)
  server.ts                 HTTP-Server (Suchen, Gebiete, Historie, Reports)
  cli.ts                    Kommandozeile (ohne Datenbank lauffähig)
```

Der Server-Lifecycle einer Suche: `POST /suchen` legt die Suche an
(status=laufend) und startet den Crawl im Hintergrund; `GET /suchen/<id>`
zeigt je nach Status die Polling-Seite, den Report (aus gespeicherten
Inseraten neu berechnet) oder die Fehlermeldung; `GET /suchen/<id>/status`
liefert den Status als JSON für das Polling.
