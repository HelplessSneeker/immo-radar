# immo-radar

Immobilienmarkt-Analyse für Anlageobjekte in Kärnten. Der Server crawlt
**einmal täglich alle Wohnungs-Inserate Kärntens** (Kauf und Miete, live von
willhaben.at und immoscout24.at), normalisiert und dedupliziert sie zu
„Objekten" und zeigt den Markt als Zeitreihen-Dashboard: Bruttorendite,
Miete/m² und Preis/m² über die Zeit, filterbar nach PLZ und Wohnfläche.
Ein manuell gepflegtes **Portfolio** stellt die eigenen Wohnungen dem Markt
gegenüber. Daneben gibt es eine CLI für Ad-hoc-Analysen aus CSV-/JSON-Dateien
oder Portal-Such-URLs.

## Voraussetzungen

- Node.js ≥ 20
- pnpm
- PostgreSQL für den Server (lokal am einfachsten via Docker Compose);
  die CLI braucht keine Datenbank

## Server (empfohlener Einstieg)

```sh
pnpm install
pnpm db:up            # startet Postgres via Docker Compose
cp .env.example .env  # DATABASE_URL (Standard passt zum Compose-Setup)
pnpm serve            # wendet Migrationen automatisch an
```

Dann <http://localhost:8787> im Browser öffnen (Port über die Umgebungsvariable
`PORT` änderbar). Alle Seiten liegen hinter HTTP-Basic-Auth
(`BASIC_AUTH_USER`/`BASIC_AUTH_PASS` aus der `.env`; ohne sie startet der
Server nicht). Die Seiten:

- **`/` – Dashboard** (Startseite): Bruttorendite, Median-Kauf-€/m² und
  Median-Kaltmiete-€/m² als Wochen-Zeitreihen über die deduplizierten
  Objekte, dazu die aktuellen Kennzahlen mit Urteil (Ziel-Rendite ≥ 4 %
  hervorgehoben). Kleiner Filter: PLZ-Präfix (`9020` exakt, `9` Region) und
  m²-Bereich – als GET-Parameter, Links sind teilbar.
- **`/inserate`**: der historisierte Roh-Bestand als paginierte, filterbare
  Tabelle – ohne Deduplizierung, mit Preisänderungs-Spalte.
- **`/portfolio`**: eigene Wohnungen manuell erfassen (Kaufpreis, aktuelle
  Kaltmiete, Fläche …). Jede Zeile zeigt die eigene Miete/m² und Ist-Rendite
  gegen den Markt-Median – verglichen zuerst in derselben PLZ, bei dünner
  Datenlage im Bezirk, notfalls Kärnten-weit (die Ebene steht immer dabei).
- **`/crawl`**: alle Sweep-Läufe mit Segment-Status – was wurde abgedeckt,
  was war gesättigt, welches Portal fiel aus.
- **`/methodik`**: jede Kennzahl erklärt, inklusive der exakten
  Matching-Schwellen.

### Der tägliche Sweep

Der Scheduler tickt alle 30 Minuten (`CRAWL_TICK_MS`); pro Tag läuft höchstens
ein erfolgreicher Sweep (DB-Claim in `sweep_laeufe`, `UNIQUE (lauf_datum)` —
race-sicher über Neustarts und Prozesse hinweg). Ein Sweep zerlegt Kärnten in
Segmente: **10 Bezirke × Kauf/Miete × 2 Portale** (Bezirk-Slugs in
`src/bezirke.ts`, alle gegen die Live-Portale verifiziert). Liefert ein
Segment mehr Treffer, als die Portal-Caps hergeben (~450 willhaben / ~225
immoscout24 bei 15 Seiten), wird es in Preisbänder geteilt und notfalls
rekursiv halbiert. Zwischen den Segmenten pausiert der Sweep
(`SWEEP_SEGMENT_PAUSE_MS`, Default 15 s); die Seiten-Pause von 1 s bleibt.
Gesamtvolumen: grob 200–600 Requests pro Tag, über ~20–40 Minuten gestreckt.

Jedes Segment schreibt sofort in den historisierten Bestand
(`inserate_bestand`, Schlüssel Portal + Inserats-ID, mit
`zuerst_gesehen`/`zuletzt_gesehen` und Preishistorie) — ein Neustart setzt
den Tages-Sweep beim ersten unfertigen Segment fort. Ein `PortalFehler`
kostet nur das Segment; der Sweep scheitert erst, wenn kein einziges Segment
durchkommt. Der Aktiv-Stichtag wird **je Portal** gemessen: ein
Portal-Ausfall lässt dessen Inserate nicht fälschlich als delistet
erscheinen.

### Objekte (Deduplizierung)

Nach jedem Sweep fasst ein Matching-Lauf Inserate zu Objekten zusammen
(`src/matching.ts`, pure Funktionen; Persistenz in `objekte` +
`inserate_bestand.objekt_id` + Audit-Log `objekt_zuordnungen`):

- **Duplikat** (zeitlich überlappend): nur portal-übergreifend — gleiche PLZ,
  Fläche ±1 m², Zimmer exakt, Preistoleranz 2,5 % (Kauf) bzw. 3 % oder 25 €
  (Miete), Baujahr-Guard ±2 Jahre. Gleichzeitig aktive Inserate desselben
  Portals mergen nie (Schutz gegen Neubauprojekte mit baugleichen Einheiten).
- **Wiedereinstellung** (Lücke ≤ 60 Tage): Preis ±10 % — die Preishistorie
  läuft weiter, die Vermarktungsdauer beginnt nicht von vorn.

Die Roh-Inserate bleiben unangetastet; `pnpm objekte:rebuild` leert die
Schicht und ordnet deterministisch neu zu (so werden Regeländerungen
ausgerollt). Zeitreihen rechnen über Objekte: ein Objekt zählt pro Stichtag
einmal — mit dem *niedrigeren* Preis, wenn es auf beiden Portalen steht —
und gilt erst als delistet, wenn alle seine Inserate verschwunden sind.

Migrationen (nummerierte SQL-Dateien in `migrations/`) laufen beim Serverstart
automatisch; `pnpm db:migrate` wendet sie manuell an.

**Hinweise:** Die Crawler lesen das in den Suchseiten eingebettete JSON;
ändert ein Portal den Seitenaufbau, degradieren dessen Segmente (sichtbar
unter `/crawl`). Scraping verstößt formal gegen die Portal-AGB — das Tool ist
für private, moderate Nutzung gedacht.

## Deployment (Coolify)

Das Repo bringt ein multi-stage `Dockerfile` mit (Build via `tsc`, Runtime nur
mit Produktions-Dependencies plus `dist/` und `migrations/`). In Coolify als
Dockerfile-Build anlegen, Postgres als separate Ressource (interner Hostname,
kein SSL nötig) und diese Env-Vars setzen:

- `DATABASE_URL` – Verbindungs-URL der Postgres-Ressource
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` – Zugangsdaten für alle Seiten;
  für Prod ein langes Secret wählen
- `PORT` – optional, Default 8787

Healthcheck-Pfad: **`/health`** (auth-frei; `200 {"status":"ok"}` bei
erreichbarer DB, sonst `503`). Migrationen laufen beim Start automatisch
(Advisory-Lock, mehrere Instanzen sind unkritisch). `SIGTERM` fährt sauber
herunter (offene Requests zu Ende, dann Pool schließen). Fehlen die
Auth-Vars, beendet sich der Container sofort mit Exit 1 (fail-closed) —
der Deploy schlägt dann sichtbar fehl statt ungeschützt zu laufen.

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

## Kennzahlen

- **Brutto-Mietrendite** = (Median-Kaltmiete €/m² × 12) / Median-Kaufpreis
  €/m²; ab 4 % hervorgehoben. Im Dashboard als Wochen-Zeitreihe.
- **Median/Quartile** mit linearer Interpolation (R-7); Ausreißer im
  CLI-Report per 1,5×IQR-Regel.
- Die Bruttorendite ignoriert Betriebskosten, Leerstand und Kaufnebenkosten —
  Nettorendite ist V2. Alle Formeln und Grenzen: `/methodik`.

## Entwicklung

```sh
pnpm test            # Vitest (Statistik, Matching, Sweep, Parsing, Crawler)
pnpm typecheck       # tsc --noEmit
pnpm build           # kompiliert nach dist/
```

Die Crawler-Tests laufen komplett offline gegen eingecheckte Fixtures
(`tests/fixtures/willhaben-next-data.json`,
`tests/fixtures/immoscout24-initial-state.html`) und ein injiziertes
Fake-`fetch` — CI braucht kein Netz. Die Datenbank-Integrationstests laufen
nur, wenn `DATABASE_URL` gesetzt ist — **immer gegen eine Test-Datenbank**
(z. B. `DATABASE_URL=postgres://immo:immo@localhost:5432/immo_test pnpm test`),
die Tests truncaten Tabellen. `scripts/verifiziere-bezirke.ts` prüft die
Bezirk-Slugs manuell gegen die Live-Portale (nie in CI).

### Architektur

Datenquellen sind hinter dem `SourceAdapter`-Interface gekapselt
(`src/adapters/source-adapter.ts`): `FileAdapter` (CSV/JSON) sowie
`WillhabenAdapter` und `ImmoScout24Adapter` (Live-Crawl). Die Portal-Adapter
implementieren zusätzlich das `PortalAdapter`-Interface
(`src/adapters/portal-adapter.ts`) mit `sucheMitStatistik(kriterien,
optionen)` — darüber crawlt der Sweep segmentweise. Ein weiteres Portal
braucht nur `src/<portal>/{map,url}.ts` + einen Adapter und wird in
`src/cli.ts` bzw. `src/server.ts` registriert.

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
  bezirke.ts                Die 10 Kärntner Bezirke + verifizierte Portal-Slugs
  search.ts                 SuchKriterien (Adapter-Vertrag) + Parser der GET/POST-Parameter
  sweep.ts                  Der tägliche Kärnten-Sweep (Segmente, Preisbänder, Resume)
  crawl.ts                  Prozessweite Crawl-Sperre (FIFO)
  scheduler.ts              Zeitplan des Sweeps (DB-Claim als Idempotenz-Anker)
  normalisierung.ts         PLZ/Ort-Normalisierung fürs Matching
  matching.ts               Objekt-Dedup: Regeln, Toleranzen, deterministische Zuordnung
  portfolio-vergleich.ts    Eigene Objekte vs. Markt (Fallback PLZ → Bezirk → Land)
  datum.ts                  Datums-Helfer (YYYY-MM-DD, UTC)
  stats.ts                  Median, Quantile, IQR-Ausreißer, Bruttorendite
  analyze.ts                Gruppierung nach Gebiet, Kennzahlen (CLI-Report)
  trend.ts                  Zeitreihen: Inserat- und Objekt-Trends, Rendite-Reihe, Filter
  report.ts                 Statischer HTML-Report der CLI (Chart.js via CDN)
  db/client.ts              Lazy Postgres-Pool (braucht DATABASE_URL)
  db/migrieren.ts           Migrations-Runner (migrations/*.sql)
  db/bestand-repo.ts        Historisierter Inseratsbestand + Preishistorie + Portal-Stichtag
  db/sweep-repo.ts          Sweep-Läufe und Segmente (Claim, Resume, Zombie-Cleanup)
  db/objekte-repo.ts        Dedup-Schicht: Objekte, Zuordnungen, Audit, Rebuild
  db/objekte-rebuild-cli.ts pnpm objekte:rebuild
  db/portfolio-repo.ts      Eigene Objekte (CRUD)
  pages/layout.ts           Gemeinsames Seitengerüst + Design-Tokens + CSS
  pages/dashboard-page.ts   Startseite: KPI-Zeile + drei Zeitreihen-Charts + Filter
  pages/inserate-page.ts    Roh-Bestand als paginierte Tabelle
  pages/portfolio-pages.ts  Portfolio-Liste mit Marktvergleich + Formulare
  pages/sweep-page.ts       Crawl-Läufe + Segment-Status
  pages/methodik-page.ts    Alle Kennzahlen erklärt
  pages/fehler-page.ts      Generische Fehlerseite
  pages/format.ts           Formatter (de-AT) und Zell-Bausteine
  server.ts                 HTTP-Server (Dashboard, Inserate, Portfolio, Crawl)
  cli.ts                    Kommandozeile (ohne Datenbank lauffähig)
```
