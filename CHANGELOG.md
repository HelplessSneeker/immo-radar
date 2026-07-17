# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Geändert

- Portfolio-Marktvergleich rechnet jetzt wie Dashboard und Top Picks
  ausreißerbereinigt: hart geflaggte Objekte (Plausibilitätsregeln,
  `datenqualitaet`) fliegen zuerst aus den Markt-Medianen, danach die
  1,5×IQR-Ausreißer der bereinigten €/m²-Verteilung je Ebene (PLZ →
  Bezirk → Kärnten) und Markt. Der Ebenen-Aufstieg
  (`MIN_VERGLEICHSOBJEKTE`) zählt die bereinigte Objektzahl — ein
  einzelnes Datenmüll-Inserat (z. B. 9758 m² Grundstücks- statt
  Wohnfläche) verzerrt Markt-Miete und -Rendite nicht mehr.

### Hinzugefügt

- Der Datenpunkte-Drawer „Die Objekte hinter den Zahlen" hat einen
  eigenen Ausreißer-Schalter (`?objekte_ausreisser=an`, Checkbox in der
  Sektion): Standardmäßig (aus) blendet er beide Ausreißer-Klassen
  komplett aus Tabelle und Punktwolke aus (der Serien-Kopf nennt
  „N Ausreißer ausgeblendet"); eingeschaltet erscheinen sie wieder —
  in der Tabelle mit „▲ Ausreißer" gebadged — und zählen in
  Serien-Median, Δ-Median-Spalte und die Median-Linie der Punktwolke.
  KPIs und Zeitreihen-Charts bleiben beim globalen `?ausreisser=an`;
  beide Schalter sind unabhängig. Der Portfolio-Marktvergleich hat
  keinen Schalter — er rechnet immer bereinigt (siehe „Geändert").
  Der Drawer bleibt beim Umschalten offen, Filter und Stichtag werden
  mitgeführt.

### Behoben

- Auth-Doku (README, RELEASE) beschrieb noch den alten
  HTTP-Basic-Auth-Stand: `SESSION_SECRET` fehlte als dritte Pflicht-Env
  (Boot-Exit 1), der Post-Deploy-Smoke erwartete fälschlich `401
  WWW-Authenticate: Basic` statt des `303`-Redirects nach `/login`, und
  die ≥-32-Zeichen-Anforderung war `BASIC_AUTH_PASS` statt
  `SESSION_SECRET` zugeschrieben.

## [1.3.0] - 2026-07-16

Vierte Runde: harte Plausibilitätsregeln gegen strukturell falsche
Inserate (persistiert als Ausreißer-Grund, mit eigener Inserate-Ansicht),
dazu die Redesign-Politur für Nicht-Techniker — Plain Language,
destilliertes Dashboard und Mobile-Karten für die dichten Tabellen.

### Geändert

- Dashboard-Layout-Pass: die KPI-Kacheln liegen jetzt direkt auf dem
  Papier statt in einer umschließenden Section (keine Karte-in-Karte
  mehr; `.tile` trägt den Flächen-Hintergrund aus DESIGN.md), die
  Ausfall-Warnung wird ein eigener leiser Hinweis-Streifen auf Fläche
  (13px-Rot verfehlt auf Papier AA). Gruppierter Seitenrhythmus statt
  Einheits-Gap: Kopf/Filter/KPIs eng (16px), Verlaufs-Charts 24px,
  Datenpunkte-Tiefe und Footer 32px. Kachel- und Chart-Grids brechen
  strukturell um: bei 2 Spalten steht das Urteils-Element (Rendite)
  voll breit oben, nichts dangelt mehr allein auf halber Breite. Der
  Filter-Button ist auf Dashboard und Top Picks jetzt der dokumentierte
  Ghost-Button (`button.klein`) statt einer blauen Primäraktion —
  Auswertungsseiten haben keine Primäraktion; Inserate war schon so.
- Dashboard destilliert („einfach draufschauen können"): Die Seite
  beginnt mit den Zahlen — der Filter liegt in einem zugeklappten
  `<details>` (eine schlanke „Filtern"-Zeile; ein aktiver Filter öffnet
  sie und benennt sich in der Summary), die Intro-Zeile entfällt
  (die Kachel-Labels sind die Orientierung), der Kopf ist zweizeilig.
  Kachel-Subs nennen nur noch die Objektzahl statt Formel- und
  Ausreißer-Prosa; die Rechenweise steht genau einmal in der
  Provenienz-Zeile („Ohne Ausreißer gerechnet · Methodik").
  Roh-Inserate-Zählung und „Sweep läuft" sind von der Seite genommen
  (leben auf /crawl bzw. im Navbar-Chip), Chart-Meta und Footer auf je
  einen Halbsatz gekürzt. Neue DESIGN.md-Regel „ein Erklär-Register
  pro Block".
- Dashboard-Filterleiste entzerrt: Fläche von/bis und der eigene
  Zeitraum von/bis sind je **ein** Bereichs-Feld (eine Legende, zwei
  kompakte Eingaben mit `aria-label`) statt vier einzeln beschrifteter
  Felder; Eingabebreiten folgen dem Inhalt (PLZ 150px, m² 76px, Datum
  145px) statt dem ~200px-Browser-Default. Der Seitenkopf bekommt 24px
  Luft zur Filterkarte, die Erklär-Zeilen der Sektionen sind auf ~76ch
  Lesebreite gekappt.
- Redesign-Politur für Nicht-Techniker (Richtung „Das ruhige Marktbüro"
  bleibt): wärmere Light-Neutralen mit sichtbarem Karten-Kontrast
  (Papier `#f5f3ec` / Fläche `#fcfbf7`), mehr Atmung in den KPI-Kacheln
  (größeres Padding, klarer Rhythmus zwischen Label, Wert, Trend und
  Sub-Zeile). Serien-Farben, Urteils-/Flach-Regel und beide Themes
  unverändert.
- Plain-Language-Mikrocopy auf den Seiten, die Nicht-Techniker nutzen:
  Fehlerseiten mit verständlicher Überschrift je Status (Code als Meta),
  Top-Picks- und Portfolio-Leerzustände ohne Jargon, PLZ-Filter-Label
  „Anfang genügt" statt „Präfix".
- Dashboard: die „Letzter Sweep"-Kachel ist als Provenienz-Meta-Zeile
  unters Kachel-Grid gewandert (neue Regel „Provenienz ist keine
  Kachel") — es bleiben die drei Urteils-KPIs Rendite, Kauf, Miete.
  Einheiten stehen abgesetzt neben dem Kachel-Wert (`.tile-einheit`),
  Zeitreihen-Tooltips reagieren auf die ganze Stichtag-Spalte, und die
  Sektionstitel sprechen Plain Language („Preisentwicklung über die
  Zeit", „Die Objekte hinter den Zahlen").
- Top Picks: die Rangliste zeigt ihren Rang (leise Nummer in der
  Objekt-Zelle, auch im Mobile-Karten-Titel) und urteilt über der
  Tabelle („X von Y Objekten erreichen das Renditeziel"); der
  Spaltenkopf „€/m² (Kauf)" heißt jetzt parallel „Kauf (€/m²)".
- Schlanke Seitenköpfe auf Dashboard und Top Picks: die h1 trägt nur
  noch den Seitennamen; Stichtag steht in der Meta-Zeile, aktive Filter
  in einer eigenen „Gefiltert: …"-Zeile.
- „Ausreißer" umfasst jetzt beide Klassen (1,5×IQR + harte
  Plausibilitätsregeln): Kennzahlen, Trend und Top Picks rechnen
  standardmäßig ohne beide, der Schalter `?ausreisser=an` holt beide
  markiert zurück (bisher nur IQR). Die IQR-Grenzen werden dabei über
  die um Hard-Regel-Fälle bereinigte Verteilung bestimmt. Semantik in
  `/methodik#ausreisser` präzisiert.

### Hinzugefügt

- Monochrome Lucide-Icons in der Hauptnavigation (in `--text-secondary`
  getönt, aktiver Eintrag in Tinte) — visuelle Orientierung, ohne das
  Farbbudget von Labels/Zahlen anzutasten.
- Orientierungszeile in Plain Language im Kopf von Dashboard und Top Picks:
  sagt in einfachen Worten, wofür die Seite da ist, über der technischen
  Herkunfts-Meta.
- Mobile-Karten für die dichten Tabellen (Top Picks, Datenpunkte,
  Portfolio): unter 640px bricht jede Zeile in eine gestapelte Karte um
  (Spaltenkopf links, Wert rechts); Desktop bleibt beim Tabellen-Layout.
- Harte Plausibilitätsregeln zusätzlich zur IQR-Statistik (feste Grenzen
  für Fläche, €/m² Kauf/Miete, Fläche pro Zimmer und absolute Preise) —
  der Grund persistiert im Bestand als `datenqualitaet`-Feld und wird bei
  jedem Sweep re-evaluiert. Adressiert den 1.2-Bug: Inserate mit
  strukturell falschen Feld-Werten (z. B. 9758 m² Grundstück statt
  Wohnfläche) fliegen jetzt aus KPIs, Trend und Top Picks, statt via
  Bulk-Fehler die IQR-Statistik zu kippen.
- `/inserate?nur=ausreisser` — die Inserate-Seite um eine
  „Nur Ausreißer"-Checkbox erweitert; bei aktivem Filter zeigt eine
  zusätzliche Spalte den Ausreißer-Grund. Dashboard-Datenpunkte und
  Top Picks nennen den Grund direkt neben dem „▲ Ausreißer"-Badge.
- CLI `pnpm plausibilitaet:rebuild` — idempotenter
  Re-Evaluations-Task für bestehende Bestand-Zeilen nach der Migration
  (Keyset-Batches, Advisory-Lock gegen parallele Läufe).

## [1.2.0] - 2026-07-14

Dritte Runde: Kennzahlen rechnen standardmäßig ohne 1,5×IQR-Ausreißer
(mit Schalter zurück zur unbereinigten Sicht), neue Top-Picks-Seite mit
Rendite-Ranking, Zeitraum-Filter mit Trend-Pfeilen in den KPI-Kacheln.

### Geändert

- `berechneObjektTrend` nimmt jetzt ein Options-Objekt statt einzelner
  Positional-Args (`{ ausreisserEinbeziehen }`) — verhindert
  Positional-Arg-Wildwuchs, wenn weitere Optionen dazukommen.
- Dashboard-Kennzahlen (Kauf-/Miete-Median, Bruttorendite, alle Trend-Charts
  und die Median-Linie der Punktwolken) rechnen 1,5×IQR-Ausreißer jetzt
  standardmäßig heraus, bestimmt je Stichtag und Markt (Kauf/Miete) auf der
  €/m²-Verteilung nach dem PLZ-/m²-Filter; die Objekt-Anzahlen beziehen sich
  auf die bereinigte Menge. Unter 4 Werten je Gruppe wird wie bisher nichts
  ausgeschlossen.

### Hinzugefügt

- Filterleisten-Schalter „Ausreißer einbeziehen" (`?ausreisser=an`, teilbar,
  überlebt Stichtag-Wechsel und Pagination; „Filter zurücksetzen" entfernt
  ihn) stellt die unbereinigten Kennzahlen wieder her.
- Datenpunkte-Tabellen markieren Ausreißer unabhängig vom Schalter mit
  „▲ Ausreißer"; Ausreißer-Zeilen bekommen kein Chance-Grün mehr, die
  Serien-Überschrift nennt die Anzahl der Ausreißer.
- Methodik-Abschnitt „Ausreißer (1,5×IQR)" erklärt Tukey-Regel,
  Berechnungsbasis und Schalter-Semantik.
- Neue Seite `/top-picks`: die 10 aktiven Kauf-Objekte mit der höchsten
  geschätzten Bruttorendite am Stichtag, mit PLZ-Präfix-Filter. Die Miete
  kommt als ausreißerbereinigter Median-Kaltmiete-€/m² des Objekt-Gebiets
  (Kaskade PLZ → Bezirk → Kärnten, min. 5 Werte nach Bereinigung; Basis
  als Badge an jeder Zeile); Kauf-Objekte, die in ihrer PLZ als
  1,5×IQR-Ausreißer gelten, fliegen aus dem Ranking. Der Schalter
  „Ausreißer einbeziehen" (`?ausreisser=an`, wie im Dashboard) holt sie
  markiert zurück und lässt die Miet-Mediane unbereinigt rechnen.
  Neuer Navbar-Eintrag „Top Picks" und Methodik-Abschnitt `#top-picks`.
- Dashboard-Filterleiste um einen Zeitraum-Filter erweitert: Presets
  `7 / 30 / 90 Tage / Alle` (`?zeitraum=7d|30d|90d|alle`, relativ zum
  letzten Sweep) plus Custom Von/Bis (`?von=…&bis=…`, absolut; gewinnt
  über das Preset). Ungültige Datumsangaben werden still verworfen, ein
  „Bis" in der Zukunft wird auf den letzten Sweep geklemmt; Zeitreihen,
  Punktwolke und Datenpunkte-Stichtag-Navigation folgen dem Zeitraum.
- KPI-Kacheln zeigen einen Trend-Pfeil mit textlichem Delta und
  Referenz-Datum vs. Anfang des gewählten Zeitraums: Rendite mit Urteil
  (`↑` grün / `↓` rot, in %-Punkten), Kauf/Miete neutral (relative
  Änderung in %); bei ≤ 1 Trend-Punkt „zu wenig Daten für Trend".

### Aufgeräumt

- `topPicks` nimmt jetzt ein Options-Objekt (`plzFilter`, `n`,
  `minMietObjekte`, `ausreisserEinbeziehen`) statt einer Positional-
  Kaskade — konsistent zu `berechneObjektTrend`.
- `/top-picks` weist gesetzte Fläche- und Zeitraum-Parameter aus dem
  Dashboard explizit als „hier ignoriert" aus statt sie stumm zu
  verwerfen (geprüft auf den rohen URL-Parametern, damit auch
  fehlgeparste Werte den Hinweis auslösen), inklusive Reset-Link.
- Site-weite Badge- und Ausreißer-Zeilen-Tokens (`.badge`,
  `.badge-critical`, `.row-outlier`) leben jetzt zentral in
  `layout.ts` statt dreifach; ebenso der „Noch keine Daten"-Leer-State
  von Dashboard und Top Picks.
- KPI-Kachel-Beschriftung präzisiert: „…, Ausreißer nicht mitgezählt"
  statt des doppeldeutigen „(ohne Ausreißer)"; Methodik nennt jetzt
  den Top-Picks-Tiebreak (dedupliziertes Objekt vor Solo-Inserat).
- README/CLAUDE.md auf den 1.2-Stand: Zeitraum-Filter, Ausreißer-
  Toggle, Top Picks, Kennzahlen-Semantik und Konventionen dokumentiert.

## [1.1.0] - 2026-07-10

Zweite Runde: Dashboard-Zeitreihen an echte Läufe geknüpft, neue
Datenpunkte-Sektion mit Punktwolke, UI-Polish über alle Server-Seiten,
Crawler mit Retry-Backoff und `/health` mit Substanz.

### Hinzugefügt

- Datenpunkte-Sektion unter dem Wochenraster: kollabierbar, Streudiagramme
  (log-Skala, lazy beim Aufklappen) plus paginierte Kauf/Miete-Tabellen
  (20 Zeilen) mit Wochen-Auswahl per `?stichtag`. Kernlogik geteilt mit
  dem Trend, damit Median und Punkte deckungsgleich sind (`0e0992b`).
- „Letzter Sweep"-Kachel zeigt die Roh-Inserate des Laufs (vor
  Deduplizierung), getrennt nach Kauf und Miete (`23a64e2`).
- Retry-Backoff für Portal-Crawler: Exponential Backoff mit Jitter über
  transiente Fehler (Netzwerk, HTTP 408/425/500/502/503/504); 429 nur
  mit explizitem `Retry-After` (gedeckelt 30 s), ohne Header fail-fast,
  damit Anti-Bot-Systeme nicht eskaliert werden (`7f55b44`, `b5315af`).
- `/health` liefert — nur mit gültiger Sitzung — `version` und
  `letzterSweep` (Datum + ISO-Timestamp). Sweep-Lookup mit Race-Timeout
  und Single-Flight, `SELECT 1` gedeckelt auf 2 s, damit hängende Pools
  den Coolify-Healthcheck nicht kippen (`7f55b44`, `b5315af`). Anonym
  bleibt es weiterhin bei `{status}`.

### Geändert

- Dashboard-Zeitreihen: ein Datenpunkt je fertigem Crawl-Lauf statt
  synthetischem 7-Tage-Gitter — einzelne Läufe (z. B. der 07.07.)
  verschwinden nicht mehr, wenn ein späterer Lauf das Raster verschiebt.
  Aktivitätsprüfung jetzt exakt (zuerst ≤ Stichtag ≤ zuletzt); der
  6-Tage-Look-back entfällt. Fehlgeschlagene Läufe bekommen weiterhin
  keinen Punkt (`23a64e2`).
- Chart-Datumslabels (Achsen und Tooltips) im Format `dd.mm.yyyy` statt
  ISO; Punktwolken-Achse mit expliziten Stichtag-Ticks (`23a64e2`).
- UI-Polish über alle Server-Seiten gegen `DESIGN.md`: gleiche
  Kachel-Höhen im Dashboard, symmetrische Rendite-Datenbasis im
  Portfolio („N Kauf · M Miete"), Portfolio-Formularfelder auf gleicher
  Y-Achse trotz ungleicher Hint-Zeilen, Fehler-Zellen der Sweep-Segmente
  in `--status-critical`, konsistenter Ton im Dashboard-Leer-State,
  Rettungs-Link „← Zurück zum Dashboard" aus Fehler-Seiten (`a80ede4`).
- Läufe-Tabelle: Fehler-Spalte trägt nur noch Fehlermeldungen mit der
  Statusfarbe der Segmente-Tabelle; Portfolio-Formular-Hints per
  `aria-describedby` an ihre Felder gebunden, damit Screenreader sie
  beim Fokussieren vorlesen (`36520a2`).

### Behoben

- Punktwolken-Achse: die symmetrische Aufspannung um den Median blähte
  die Achse bei einzelnen Tief-Ausreißern um Dekaden auf und drückte
  die Median-Linie flach — die log-Achse passt sich jetzt automatisch
  an die Daten an (`4d0192e`).
- `input[type=date]` folgt dem Formular-Styling und dem Theme;
  `color-scheme: light dark` auf `:root`, damit auch die nativen
  Widget-Teile (Kalender-Icon, Picker-Popup, Scrollbars) dem aktiven
  Theme folgen (`806a98c`).

### Bekannte Grenzen

- Die Punktwolke der Datenpunkte-Sektion wächst mit täglichen Stichtagen
  um ~3,5k Werte pro Tag Historie; bei Bedarf später auf die letzten N
  Stichtage kappen.

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

[Unreleased]: https://github.com/HelplessSneeker/immo-radar/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/HelplessSneeker/immo-radar/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/HelplessSneeker/immo-radar/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/HelplessSneeker/immo-radar/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/HelplessSneeker/immo-radar/compare/43cc18e...v1.0.0
[0.1.0]: https://github.com/HelplessSneeker/immo-radar/commits/43cc18e
