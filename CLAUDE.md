# immo-radar

Immobilienmarkt-Analyse für Anlageobjekte in Kärnten: täglicher Voll-Crawl aller Wohnungs-Inserate, Deduplizierung zu Objekten, Zeitreihen-Dashboard (Rendite, Miete/m², Preis/m²) und eigenes Portfolio mit Marktvergleich. Architektur, Befehle und Datenmodell: siehe [README.md](README.md).

## Design Context

- **[PRODUCT.md](PRODUCT.md)** — Register (product), Nutzer, Markenpersönlichkeit, Anti-Referenzen und die 5 Design-Prinzipien. Vor UI-Arbeit lesen.
- **[DESIGN.md](DESIGN.md)** — Das visuelle System („Das ruhige Marktbüro"): Farbtokens (hell/dunkel), Typografie, Komponenten-Vokabular, Do's & Don'ts. Die Tokens leben im Code in `src/pages/layout.ts`, `src/pages/dashboard-page.ts` und `src/report.ts` — Änderungen dort und in DESIGN.md synchron halten.

Kurzfassung der Prinzipien: Zahlen mit Urteil liefern (Schwellen hervorheben, Ausreißer markieren); Dichte mit Leseführung; vertraute Standard-Affordances statt Originalität; ehrlich über Datenqualität; auch für Nicht-Techniker lesbar. Anti-Referenzen: Excel-Ästhetik, Portal-Optik, SaaS-Dashboard-Klischee.

## Datenbank

**Die Dev-Datenbank (`immo`) niemals zurücksetzen** — kein Drop, kein TRUNCATE, kein Volume-Reset: Hier wird der Datensatz (Bestand, Preishistorie, Objekt-Zuordnungen, Portfolio) während der Entwicklung kuratiert und wächst über die täglichen Sweeps. Schema-Änderungen ausschließlich über neue, additive Migrationen in `migrations/`. Integrationstests laufen nur gegen `immo_test` (`DATABASE_URL=postgres://immo:immo@localhost:5432/immo_test pnpm test`) — sie truncaten Tabellen und dürfen die Dev-DB nie sehen.

## Branches & Workflow

Integrationsbranch ist **`dev`**: Feature-/Chore-Branches dorthin mergen (PRs bzw. `--no-ff`-Merges); `main` wird separat auf Release-Stände gehoben. Vor größeren Arbeiten prüfen, ob `origin/dev` Neues hat, und es in den Arbeitsbranch mergen.

## Lokal verifizieren

Die Rezeptur (Server-Start mit `.env`, Login, curl-Probes, Headless-Chromium für die Charts) steht in `.claude/skills/verify/SKILL.md`. Zwei Fallstricke:

- Ein gestarteter Dev-Server löst ≤ 30 min nach Start einen **echten Portal-Sweep** aus (schreibt in die Dev-DB und verschiebt den Stichtag) — nach der Verifikation stoppen.
- Test-Assertions gegen gerendertes HTML: `Intl` (de-AT) gruppiert Zahlen mit **NBSP** (U+00A0), nicht mit Leerzeichen — in Erwartungswerten das echte Zeichen verwenden, sonst matchen `toContain`-Prüfungen nicht.
