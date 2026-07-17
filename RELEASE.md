# Release-Ablauf (Coolify)

Schritt-für-Schritt-Anleitung für den Deploy auf Coolify. Kurzfassung und
Architektur-Kontext: [README → Deployment (Coolify)](README.md#deployment-coolify).

## 1. Vor dem Deploy

1. `pnpm typecheck` — grün.
2. `DATABASE_URL=postgres://immo:immo@localhost:5432/immo_test pnpm test` — grün.
   Die URL immer explizit auf `immo_test` setzen: Die Integrationstests
   truncaten Tabellen in der Datenbank aus `DATABASE_URL` — mit der Dev-DB
   `immo` wäre der kuratierte Bestand weg. Ohne gesetzte `DATABASE_URL`
   werden die Integrationstests still übersprungen (grün ohne DB-Abdeckung).
3. `main` ist sauber (`git status`), alle Änderungen gemerged.
4. Commit-SHA notieren (`git rev-parse --short HEAD`) — für Rollback-Referenz.

## 2. Coolify-Ressourcen anlegen

Reihenfolge einhalten: erst die Datenbank, dann die Anwendung.

1. **Postgres** als eigene Ressource:
   - Version 16 oder neuer.
   - Interner Hostname (die App verbindet sich nur intern, kein SSL nötig).
   - Volume für `/var/lib/postgresql/data` (sonst ist der Bestand nach einem
     Neustart weg).
2. **Anwendung** als Dockerfile-Build:
   - Repo `HelplessSneeker/immo-radar`, Branch `main`.
   - Dockerfile-Pfad: `Dockerfile` (Repo-Root).

## 3. Env-Vars in der Anwendung

1. `DATABASE_URL` — Verbindungs-URL aus der Postgres-Ressource
   (interner Host, kein SSL), z. B.
   `postgres://immo:<passwort>@<interner-host>:5432/immo`.
2. `BASIC_AUTH_USER` — kurzer Login-Name für das `/login`-Formular.
3. `BASIC_AUTH_PASS` — Passwort für das `/login`-Formular; für Prod ein
   langes Secret wählen.
4. `SESSION_SECRET` — Geheimnis, mit dem das Session-Cookie signiert wird
   (HMAC-SHA256); **mindestens 32 Zeichen**, sonst startet der Server nicht.
   Erzeugen mit: `openssl rand -base64 32`. Rotation invalidiert alle
   bestehenden Sitzungen.
5. `PORT` — optional, Default 8787. Nur setzen, wenn Coolify auf einen
   anderen Port bindet. Mindestens 1024: Der Container läuft als
   unprivilegierter `node`-User und kann keine Ports darunter binden
   (z. B. `PORT=80` → Crash beim Start).

Ohne `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` oder mit fehlendem bzw. zu kurzem
`SESSION_SECRET` beendet sich der Container sofort mit Exit 1 (fail-closed)
— der Deploy schlägt sichtbar fehl statt ungeschützt zu laufen.

## 4. Healthcheck

1. Pfad: `/health` (auth-frei).
2. Intervall: Coolify-Default.
3. Timeout: mindestens 5 Sekunden — der Check macht ein `SELECT 1` gegen die DB.
4. Erwartete Antwort: `200 {"status":"ok"}`; bei nicht erreichbarer DB
   `503 {"status":"db-unreachable"}`.

## 5. Erster Deploy

Bauen lassen und die Logs beobachten:

1. `Migration angewendet: <datei>` — einmal pro Migration; die `.sql`-Dateien
   aus `migrations/` laufen beim Start automatisch (Advisory-Lock, mehrere
   Instanzen sind unkritisch).
2. `immo-radar läuft: http://localhost:<PORT>` — der Server ist oben.
3. Kein sofortiger Exit 1 — der würde auf fehlende
   `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` oder ein fehlendes/zu kurzes
   `SESSION_SECRET` hindeuten (siehe Schritt 3).

## 6. Post-Deploy-Smoke

Einmal durchklicken bzw. curlen:

1. `curl -f https://<host>/health` → `200 {"status":"ok"}`.
2. Aufruf `/` ohne Anmeldung → `303` nach `/login?return=%2F`
   (Session-Cookie-Login, kein Basic-Auth-Popup).
3. Anmelden über das `/login`-Formular (`BASIC_AUTH_USER`/`BASIC_AUTH_PASS`)
   → Dashboard lädt (leer, noch keine Daten); der Browser trägt ab jetzt das
   signierte Cookie `sitzung`.
4. `/crawl` → Sweep-Liste zeigt bereits den ersten Lauf: Der Scheduler
   tickt sofort beim Boot, der erste Sweep läuft also schon Sekunden nach
   dem Start (danach alle `CRAWL_TICK_MS`, Default 30 Minuten). Einen
   manuellen Trigger gibt es nicht; pro Tag läuft höchstens ein
   erfolgreicher Sweep.

## 7. Rollback

1. In Coolify auf den vorherigen Container-Tag zurückrollen.
2. Postgres bleibt unverändert — alle Migrationen sind additiv, ein
   DB-Rollback ist nicht nötig.

## 8. Backup-Hinweis

Postgres-Volume regelmäßig sichern (`pg_dump`); ohne Backup ist der
historisierte Bestand nach einem Volume-Verlust weg. (Kein Cron, kein
Skript in diesem Repo — bewusst nur eine Notiz.)
