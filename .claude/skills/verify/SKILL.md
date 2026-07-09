---
name: verify
description: immo-radar lokal starten und Änderungen end-to-end im Browser/per curl verifizieren
---

# immo-radar verifizieren

## Starten

- Postgres muss laufen (`docker ps` → `fable-test-db-1`, sonst `pnpm db:up`).
- `PORT=8899 pnpm serve` (Hintergrund). Der Server lädt `.env` selbst
  (DATABASE_URL, BASIC_AUTH_USER=immo, BASIC_AUTH_PASS=test, SESSION_SECRET).
- Achtung: der Scheduler startet ≤ 30 min nach Serverstart einen echten
  Portal-Sweep — Server nach der Verifikation wieder stoppen.
- Die Dev-DB `immo` wird nur gelesen; niemals resetten (siehe CLAUDE.md).

## Anfahren

- Readiness: `curl http://localhost:8899/health` (ohne Auth).
- Login für alle anderen Seiten:
  `curl -c cookies.txt -X POST -d "benutzer=immo&passwort=test" http://localhost:8899/login` → 303,
  danach `curl -b cookies.txt http://localhost:8899/...`.

## Browser (Charts sind Client-seitig, Chart.js via CDN)

- Kein System-Chromium; Playwright-Cache nutzen:
  `pnpm add playwright-core` in einem Scratch-Verzeichnis (dort ggf.
  `devEngines`/`packageManager` aus der generierten package.json löschen, sonst
  verweigert pnpm) und
  `chromium.launch({ executablePath: '/home/bfn/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome' })`.
- Login im Browser: Felder `benutzer`/`passwort` auf `/login`, dann navigieren.
- Charts brauchen Internet (Chart.js-CDN). Canvas-Inhalt prüfbar per
  `getImageData` (bemalte Pixel zählen); Element-Screenshots der ganzen
  Datenpunkte-Sektion sind ~125k px hoch — Viewport-Screenshots verwenden.

## Lohnende Flows

- `/` Dashboard: KPI-Kacheln vs. Sektions-Mediane quervergleichen (müssen
  identisch sein), `?stichtag=…` (offen + Fallback bei ungültigem Datum),
  Filter `?plz=…` kombiniert mit Stichtag, Tabellen-Pagination
  `?kauf_seite=…&miete_seite=…` (Klemme auf letzte Seite, gegenseitige
  Erhaltung der Seiten in den Links).
- `/inserate`: Filter + Pagination.
- Unfug-Params (`?stichtag=<script>`) → 200, keine Reflexion.
