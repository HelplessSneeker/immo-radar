# immo-radar

Immobilienmarkt-Analyse für Anlageobjekte in Kärnten: täglicher Voll-Crawl aller Wohnungs-Inserate, Deduplizierung zu Objekten, Zeitreihen-Dashboard (Rendite, Miete/m², Preis/m²) und eigenes Portfolio mit Marktvergleich. Architektur, Befehle und Datenmodell: siehe [README.md](README.md).

## Design Context

- **[PRODUCT.md](PRODUCT.md)** — Register (product), Nutzer, Markenpersönlichkeit, Anti-Referenzen und die 5 Design-Prinzipien. Vor UI-Arbeit lesen.
- **[DESIGN.md](DESIGN.md)** — Das visuelle System („Das ruhige Marktbüro"): Farbtokens (hell/dunkel), Typografie, Komponenten-Vokabular, Do's & Don'ts. Die Tokens leben im Code in `src/pages/layout.ts`, `src/pages/dashboard-page.ts` und `src/report.ts` — Änderungen dort und in DESIGN.md synchron halten.

Kurzfassung der Prinzipien: Zahlen mit Urteil liefern (Schwellen hervorheben, Ausreißer markieren); Dichte mit Leseführung; vertraute Standard-Affordances statt Originalität; ehrlich über Datenqualität; auch für Nicht-Techniker lesbar. Anti-Referenzen: Excel-Ästhetik, Portal-Optik, SaaS-Dashboard-Klischee.

## Datenbank

**Die Dev-Datenbank (`immo`) niemals zurücksetzen** — kein Drop, kein TRUNCATE, kein Volume-Reset: Hier wird der Datensatz (Bestand, Preishistorie, Objekt-Zuordnungen, Portfolio) während der Entwicklung kuratiert und wächst über die täglichen Sweeps. Schema-Änderungen ausschließlich über neue, additive Migrationen in `migrations/`. Integrationstests laufen nur gegen `immo_test` (`DATABASE_URL=postgres://immo:immo@localhost:5432/immo_test pnpm test`) — sie truncaten Tabellen und dürfen die Dev-DB nie sehen.

## Kennzahlen-Semantik

Median-Kauf/-Miete, Bruttorendite und die Trend-Charts rechnen standardmäßig OHNE 1,5×IQR-Ausreißer (bestimmt je Stichtag und Markt nach dem PLZ-/m²-Filter). Der URL-Parameter `?ausreisser=an` (Checkbox in der Filterleiste, teilbar) stellt für KPIs und Zeitreihen das unbereinigte Altverhalten wieder her. Der Datenpunkte-Drawer hat seit 1.3.1 einen EIGENEN Schalter `?objekte_ausreisser=an` (Checkbox in der Sektion): Standardmäßig (aus) blendet er beide Ausreißer-Klassen KOMPLETT aus Tabellenzeilen und Punktwolke aus (der Serien-Kopf nennt „N Ausreißer ausgeblendet"); eingeschaltet erscheinen sie wieder — in der Tabelle mit „▲ Ausreißer" gebadged — und zählen in Serien-Median, Δ-Median-Spalte und die Median-Linie der Punktwolke. Beide Schalter sind unabhängig, keiner impliziert den anderen; KPIs und Zeitreihen bleiben allein am globalen Schalter. Der Portfolio-Marktvergleich rechnet IMMER bereinigt (Hard-Flags, dann 1,5×IQR je Ebene; `MIN_VERGLEICHSOBJEKTE` zählt die bereinigte Menge) — er hat bewusst keinen Schalter. Details in `/methodik#ausreisser`.

Der Dashboard-Zeitraum-Filter (`?zeitraum=7d|30d|90d` oder `?von=…&bis=…`) klemmt die Stichtag-Liste im Handler (`src/server.ts`); `berechneObjektTrend` bleibt pur. Presets sind relativ zum letzten Sweep-Datum, nicht zu `new Date()` — sonst wären sie nicht reproduzierbar.

Top Picks (`/top-picks`) rankt Kauf-Objekte am aktuellen Stichtag nach geschätzter Bruttorendite; die Miete kommt aus dem ausreißerbereinigten Median-Kaltmiete-€/m² des Gebiets (Kaskade PLZ → Bezirk → Kärnten, `TOP_PICKS_MIN_MIET_OBJEKTE = 5` nach Bereinigung). Kauf-Objekte, die in ihrer PLZ-lokalen €/m²-Verteilung Ausreißer sind, fliegen aus dem Ranking — es sei denn, `?ausreisser=an`.

## Branches & Workflow

Integrationsbranch ist **`dev`**: Feature-/Chore-Branches dorthin mergen (PRs bzw. `--no-ff`-Merges); `main` wird separat auf Release-Stände gehoben. Vor größeren Arbeiten prüfen, ob `origin/dev` Neues hat, und es in den Arbeitsbranch mergen.

## Lokal verifizieren

Die Rezeptur (Server-Start mit `.env`, Login, curl-Probes, Headless-Chromium für die Charts) steht in `.claude/skills/verify/SKILL.md`. Zwei Fallstricke:

- Ein gestarteter Dev-Server löst ≤ 30 min nach Start einen **echten Portal-Sweep** aus (schreibt in die Dev-DB und verschiebt den Stichtag) — nach der Verifikation stoppen.
- Test-Assertions gegen gerendertes HTML: `Intl` (de-AT) gruppiert Zahlen mit **NBSP** (U+00A0), nicht mit Leerzeichen — in Erwartungswerten das echte Zeichen verwenden, sonst matchen `toContain`-Prüfungen nicht.

## Konventionen

- **Datums-Parsing:** `istIsoDatum` aus `src/datum.ts` prüft Format UND Kalender-Plausibilität — überall nutzen, nicht selbst regex'en.
- **Filter-Parser (`parseDashboardFilter`) ist bewusst nachsichtig:** ungültige Werte werden still verworfen (keine 500er, kein Fehler-Rendering), weil URLs teilbar sind. Anders im Portfolio-Formular: dort `SuchKriterienFehler` mit sichtbarem Fehlerpfad.
- **Options-Objekte statt Positional-Args, wenn 3+ optionale Parameter zusammenkommen** — z. B. `berechneObjektTrend(objekte, stichtage, { ausreisserEinbeziehen })` und `topPicks(objekte, stichtag, { plzFilter, ausreisserEinbeziehen })`. Verhindert `undefined, undefined, …`-Kaskaden an den Call-Sites.
