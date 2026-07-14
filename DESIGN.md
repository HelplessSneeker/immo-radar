---
name: immo-radar
description: Nüchterne Marktanalyse für Anlageobjekte — Zahlen mit Urteil, ohne Portal-Rauschen
colors:
  page: "#f9f9f7"
  surface: "#fcfcfb"
  ink: "#0b0b0b"
  ink-secondary: "#52514e"
  ink-muted: "#898781"
  grid: "#e1e0d9"
  baseline: "#c3c2b7"
  border: "#0b0b0b1a"
  akzent: "#1a66c4"
  serie-kauf: "#2a78d6"
  serie-miete: "#1baf7a"
  serie-drei: "#eda100"
  status-critical: "#d03b3b"
  status-good: "#2e7d43"
  good-text: "#006300"
  good-bg: "#0ca30c14"
typography:
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
rounded:
  control: "6px"
  tile: "8px"
  section: "10px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  page: "24px"
components:
  navbar:
    backgroundColor: "{colors.surface}"
    borderBottom: "1px solid {colors.baseline}"
    padding: "12px 24px"
  button-primary:
    backgroundColor: "{colors.akzent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-klein:
    backgroundColor: "transparent"
    textColor: "{colors.akzent}"
    rounded: "{rounded.control}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  section-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.section}"
    padding: "20px"
  tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.tile}"
    padding: "14px 16px"
  tile-good:
    backgroundColor: "{colors.good-bg}"
    rounded: "{rounded.tile}"
    padding: "14px 16px"
---

# Design System: immo-radar

## 1. Overview

**Creative North Star: "Das ruhige Marktbüro"**

immo-radar sieht aus wie der Schreibtisch eines nüchternen Analysten: papierwarme Neutrale, präzise Tabellen, und Farbe ausschließlich dort, wo sie Bedeutung trägt. Das System ist dicht — Vergleich ist der Kern des Produkts — aber nie laut. Jede Kennzahl kommt mit ihrem Urteil (hervorgehoben ab Schwelle, Ausreißer markiert), damit der Leser entscheidet statt rechnet. Die Oberfläche verschwindet hinter der Aufgabe.

Das System lehnt explizit ab: Excel-Ästhetik (rohe Zahlengitter ohne Hierarchie), Immobilienportal-Optik (Foto-Kacheln, Badges, Dringlichkeitsdruck) und das generische SaaS-Dashboard (KPI-Kachel-Wände, Gradients, Icon-Karten). Es gibt zwei gleichwertige Themes — hell und dunkel via `prefers-color-scheme`, mit identischem Token-Vokabular; alle Werte hier sind die Light-Werte. Die eine Code-Quelle für alle Tokens ist `TOKEN_CSS` in `src/pages/layout.ts` (Report und Gebiets-Seiten importieren sie von dort).

**Key Characteristics:**
- Papierwarme Neutrale (warmes Grau, kein reines Weiß/Schwarz außer Text)
- Farbe = Bedeutung: Serien-Blau (Kauf), Serien-Grün (Miete), Status-Rot/Grün — nie Dekoration
- Dichte Tabellen mit Leseführung: tabellarische Ziffern, rechtsbündige Zahlenspalten, gedämpfte Header
- Flach: 1px-Konturen und Flächentönung statt Schatten
- System-Schrift, ein einziges Font-Vokabular für alles

## 2. Colors

Warme, papierartige Neutrale als Bühne; drei Serienfarben und zwei Statusfarben als einzige Stimmen.

### Primary
- **Akzent-Blau** (#1a66c4, dunkel #3987e5; Button-Fläche dunkel #2a6fc9): Links, Primäraktion (Filter-/Formular-Button), Ghost-Buttons, Fokus-Ringe und der Status „läuft". AA-geprüft: ≥ 4,5:1 als Text auf Papier/Fläche und mit weißem Text als Fläche — deshalb hat der Dark-Button einen eigenen, dunkleren Wert (`--akzent-flaeche`).
- **Serien-Blau / Kauf** (#2a78d6, dunkel #3987e5): Ausschließlich die Kauf-Serie in Charts (Grafikflächen brauchen nur 3:1). Nicht für Text oder Aktionen — dafür ist Akzent-Blau da.
- **Serien-Grün / Miete** (#1baf7a, dunkel #199e70): Miete-Serie in Charts. Nie für Aktionen.
- **Serien-Gelb** (#eda100, dunkel #c98500): Dritter kategorialer Slot (Reserve für weitere Serien). Sparsam.

### Neutral
- **Papier** (#f9f9f7, dunkel #0d0d0d): Seitenhintergrund und Eingabefelder — warm getönt, kein reines Weiß.
- **Fläche** (#fcfcfb, dunkel #1a1a19): Sections und Tiles, eine Nuance heller als die Seite.
- **Tinte** (#0b0b0b, dunkel #ffffff): Primärtext.
- **Tinte gedämpft** (#52514e, dunkel #c3c2b7): Sekundärtext, Meta-Zeilen, Tile-Labels.
- **Tinte leise** (#898781, beide Themes): Hinweise, Tabellen-Header, Footer — nur für ≥bold 13px oder unkritische Nebentexte.
- **Raster** (#e1e0d9, dunkel #2c2c2a): Tabellen-Trennlinien, Input-Konturen, Chart-Grid.
- **Basislinie** (#c3c2b7, dunkel #383835): Achsen und Header-Unterkanten — eine Stufe kräftiger als das Raster.
- **Kontur** (rgba(11,11,11,0.10), dunkel rgba(255,255,255,0.10)): Ränder von Sections und Tiles.

### Status
- **Kritisch** (#d03b3b, dunkel #e35d5d): Fehlgeschlagene Sweeps und Segmente, Ausreißer-Markierung, Fehlertexte, Lösch-Aktionen. Der Dark-Wert ist heller, damit er auf dunklen Flächen AA besteht.
- **Gut** (#2e7d43 als Badge-Text, dunkel #58b06f; Flächen: Text #006300 auf rgba(12,163,12,0.08)): Rendite ≥ 4 %, Status „fertig" — und Preissenkungen: immo-radar ist ein Käufer-Werkzeug, ein gesenkter Preis ist eine Kaufgelegenheit, kein Warnsignal.

### Named Rules
**Die Urteils-Regel.** Statusfarben (Rot/Grün) erscheinen ausschließlich, wenn eine Zahl ein Urteil trägt — Rendite über Schwelle, Ausreißer, Preissenkung, Suchstatus. Niemals dekorativ, niemals auf neutralen Werten.

**Die Serien-Regel.** Kauf ist immer Blau, Miete immer Grün — in jedem Chart, jeder Legende, jedem Badge, auf jeder Seite. Die Zuordnung wird nie getauscht.

## 3. Typography

**Body Font:** system-ui (mit -apple-system, "Segoe UI", sans-serif)

**Character:** Eine einzige System-Familie für alles — Überschriften, Labels, Daten, Fließtext. Hierarchie entsteht über Größe (12–15–20–30) und Gewicht (400/600), nicht über Schriftwechsel. Unauffällig, schnell, vertraut.

### Hierarchy
- **Display / Tile-Wert** (600, 30px, 1.15): Die eine große Zahl pro Kennzahl-Tile (z. B. Bruttorendite). Nur für Zahlen mit Urteil.
- **Headline / h1** (600, 20px): Seitentitel, einer pro Seite.
- **Title / h2** (600, 15px): Section-Überschriften.
- **Body** (400, 14px, 1.5): Fließtext, Formulare, Zellen-Basis.
- **Label** (600, 13px): Formular-Labels, Legenden, Chart-Titel; Tabellen-Header in Tinte-leise.
- **Fußnote** (400, 12px): Hinweise, Badges, Footer, Sub-Zeilen in Tabellen.

### Named Rules
**Die Tabellenziffern-Regel.** Jede Zahlenspalte ist rechtsbündig und nutzt `font-variant-numeric: tabular-nums`. Vergleichbarkeit der Ziffern ist nicht verhandelbar.

## 4. Elevation

Vollständig flach. Es gibt keinen einzigen `box-shadow` im System — Tiefe entsteht über 1px-Konturen (Kontur-Token), die minimale Tonabstufung zwischen Papier und Fläche, und im Chart über einen 2px-Ring in Flächenfarbe um Datenpunkte. Interaktive Zustände arbeiten mit Opazität (Button `:disabled` 0.6) und Farbtönung (`good-bg`, Ausreißer-Zeilen mit 6 % Rot-Mischung), nicht mit Erhebung. Tastatur-Fokus ist die eine Ausnahme mit sichtbarem Umriss: jedes interaktive Element bekommt per `:focus-visible` einen 2px-Ring in Akzent-Blau mit 2px Abstand.

### Named Rules
**Die Flach-Regel.** Schatten sind verboten. Wenn eine Fläche sich abheben muss, bekommt sie eine Kontur oder eine Tönung — nie einen Schatten.

## 5. Components

### Navbar (Hauptnavigation)
- **Auf jeder Server-Seite** die eine Konstante Bildschirm zu Bildschirm: schlanke Leiste über volle Seitenbreite, Fläche auf Papier, 1px Basislinien-Unterkante, 12px/24px Padding. **Sticky** (`top: 0`) — auf den langen Auswertungsseiten bleibt die Navigation erreichbar; die Abgrenzung zum durchscrollenden Inhalt leistet die Basislinie, kein Schatten (Flach-Regel).
- **Aufbau:** Wortmarke „immo-radar" (Tinte, 600, Link auf `/`) links, daneben die fünf Einträge **Dashboard** (`/`, die Startseite — der Markt als Zeitreihe steht vorn), **Top Picks** (`/top-picks`, die Rendite-Rangliste je Objekt — Auswertung vor Roh-Sicht), **Inserate** (`/inserate`, die Roh-Sicht hinter dem Dashboard), **Portfolio** (`/portfolio`, die eigenen Objekte), **Crawl-Läufe** (`/crawl`, die Datenherkunft) in Akzent-Blau, ohne Unterstreichung (Hover: unterstrichen). Bricht auf schmalen Viewports per `flex-wrap` um. Fünf Einträge sind die Obergrenze der ruhigen Leiste — `/methodik` ist Referenz, kein Arbeitsfluss, und wird nur kontextuell von den Kennzahlen aus verlinkt.
- **Aktiver Eintrag:** `aria-current="page"` + Tinte/600 — Zustand trägt Markup und Optik gemeinsam, nie Farbe allein. Fehler- und Sonderseiten (auch `/methodik`) dürfen ohne Markierung bleiben.
- **Ausnahme:** Statisch exportierte CLI-Reports rendern ohne Navbar — ihre Links liefen ohne laufenden Server ins Leere.
- Quelle: `renderNavbar`/`seite()` in `src/pages/layout.ts`; kontextuelle Rücksprünge (z. B. „← Zurück zum Gebiet") bleiben Sache der Seite, nicht der Navbar.

### Buttons
- **Shape:** Sanft gerundet (6px), keine Kontur bei der Primäraktion.
- **Primary:** Serien-Blau-Fläche, weißer Text, 600er Gewicht (10px 16px Padding). Eine Primäraktion pro Seite.
- **Klein/Ghost:** Transparent mit Raster-Kontur, Akzenttext, 12px/400 (4px 10px) — für Zeilen-Aktionen wie „jetzt crawlen". Destruktive Zeilen-Aktionen („löschen") tragen Kritisch-Rot als Text und verlangen eine Bestätigung.
- **Disabled:** Opazität 0.6, Cursor `wait` (Buttons deaktivieren während laufender Aktionen).

### Cards / Containers
- **Section:** Fläche auf Papier, 1px Kontur, 10px Radius, 20px Innenabstand. Das Grundmodul jeder Seite; Inhaltsbreite 560px (Formulare, `breite: 'schmal'`) bzw. 1080px (Auswertungen, `breite: 'breit'`), zentriert.
- **Tile (Kennzahl):** 1px Kontur, 8px Radius, 14px/16px Padding. Aufbau: Label (13px gedämpft) → Wert (30px/600) → Badge (12px). `tile-good` bekommt die Gut-Tönung als Fläche.
- **Die Kachel-Wand-Schwelle:** Kennzahl-Tiles sind nach Urteil sortiert (beste Rendite zuerst) und auf 8 begrenzt — ab dem 9. Gebiet wird die Sektion zur kompakten Urteils-Tabelle, sonst entsteht genau die KPI-Kachel-Wand, die das System ablehnt.
- **Verschachtelte Karten sind verboten.** Tiles liegen im Grid nebeneinander, nie ineinander.

### Inputs / Fields
- **Style:** Papier-Hintergrund (dunkler als die Section-Fläche), 1px Raster-Kontur, 6px Radius, 8px/10px Padding, erbt die Body-Schrift. Gilt für alle Input-Typen inkl. `date` — kein Feld fällt aufs Browser-Default zurück.
- **Native Widget-Teile** (Datums-Picker, Select-Dropdown, Scrollbars): folgen dem aktiven Theme via `color-scheme: light dark` auf `:root`.
- **Labels:** 600/13px über dem Feld; Hinweise 12px in Tinte-leise darunter.
- **Bereichs-Felder** (von–bis): zweispaltiges Grid mit 8px Lücke.

### Tables
- **Style:** 13px, linksbündige Textspalten, rechtsbündige Zahlenspalten mit Tabellenziffern. Trennung nur durch 1px Raster-Linien unter den Zeilen — keine Zebra-Streifen, keine Außenkontur.
- **Header:** Tinte-leise, 600, Basislinien-Unterkante; `scope`-Attribute auf allen Header-Zellen.
- **Urteil in der Zeile:** Ausreißer-Zeilen mit 6 % Rot-Tönung plus Text-Badge „▲ Ausreißer" (12px/600 in Kritisch) — im Report wie in den Dashboard-Datenpunkten; Ausreißer-Zeilen bekommen kein Chance-Grün (erst prüfen, dann urteilen). Sub-Informationen als 12px-Block unter dem Zellenwert.
- **Herkunfts-Badge (neutral):** Wo ein Wert aus einer Vergleichsbasis geschätzt ist (Top Picks: „Miete aus PLZ/Bezirk/Kärnten"), steht die Basis als 12px-Badge in Tinte-gedämpft unter dem Wert — Herkunft ist Fakt, kein Urteil, daher keine Statusfarbe (Ehrlichkeits-Prinzip wie die Vergleichsebene im Portfolio). Urteilszellen in Tabellen (Top Picks: Rendite ≥ Ziel) nutzen dieselben Töne wie `tile-good` — Gut-Tönung als Zellfläche plus `good-text`/600 auf dem Wert — und tragen das Urteil zusätzlich als Text („≥ Ziel 4 %"), nie als Farbe allein.
- **Overflow:** Jede Tabelle liegt in einem `.tabelle-scroll`-Container (`overflow-x: auto`) — auf schmalen Viewports scrollt die Tabelle, nie die Seite.

### Status-Badges
- **Style:** Reiner Text, 12px/600, kein Hintergrund, keine Pille. Farbe + Wortlaut tragen den Zustand gemeinsam: „läuft" (Blau), „fertig" (Grün), „fehlgeschlagen" (Rot), „inaktiv" und „delistet" (Tinte-leise — delistet ist kein Fehler, sondern ein neutraler Lebenszyklus-Zustand).

### Seiten-Navigation (Blättern)
- **Style:** `.seiten-nav` — reine Textlinks „← Zurück" / „Weiter →" (Akzent) links und rechts, dazwischen der Zähler „Seite 3 von 12 · 583 Inserate" als Meta-Text mit Tabellenziffern. Unter der Tabelle; bei mehreren Seiten zusätzlich eine Meta-Zähl-Zeile über der Tabelle.
- **Regeln:** Keine Buttons, keine Seitenzahlenreihe. Am Rand (erste/letzte Seite) entfällt der jeweilige Link ersatzlos — kein ausgegrauter Disabled-Fake. Der Seitenstand lebt im Query-Parameter (`?seite=3`), Links bleiben teilbar.

### Filterleiste
- **Style:** `.filterleiste` — inline GET-Formular über Auswertungstabellen: Selects/Textfeld mit 600/13px-Labels darüber, abgeschlossen mit einem Ghost-Button „Filtern". Bricht per `flex-wrap` um.
- **Schalter-Felder:** native Checkbox im `.feld-toggle` (Label 400 statt 600 — das Label ist hier der klickbare Text, keine Feldüberschrift), darunter ein 12px-Meta-Link auf den passenden `/methodik`-Anker. Beispiel: „Ausreißer einbeziehen" (`?ausreisser=an`) auf dem Dashboard und den Top Picks.
- **Regeln:** Filter sind GET-Parameter und funktionieren ohne JS; gesetzte Filter zeigen einen Textlink „Filter zurücksetzen". Eine Auswertungsseite hat keine Primäraktion — der Filter-Button bleibt Ghost.

### Erklärzeilen (Kennzahl-Herkunft)
- Jede Kennzahl-Sektion nennt ihre Datenbasis in einer Meta-Zeile direkt unter der h2 (ein Halbsatz, z. B. „Aktiv = im letzten erfolgreichen Lauf gesehen") und verlinkt den passenden Anker der `/methodik`-Seite („Details"). Kennzahl-Kacheln tragen die Kurzeinordnung in der `.tile-sub`; unter dem Kachel-Grid steht eine Zeile „Alle Kennzahlen erklärt → Methodik" statt eines Links pro Kachel. Keine `title`-Tooltips — nicht tastatur-/touch-tauglich.

### Charts (Signature)
Chart.js mit striktem Token-Bezug: Serien lesen ihre Farben zur Laufzeit aus den CSS-Variablen (`--series-kauf` …), Grid in Raster-Farbe, Achsen in Basislinie, Ticks in Tinte-leise, Legende mit Punkt-Stil. Datenpunkte tragen einen 2px-Ring in Flächenfarbe; Ausreißer sind rote Rauten. Kauf und Miete bekommen getrennte Panels, weil die Skalen ~300× auseinanderliegen. Fällt das CDN aus, erscheint ein Hinweis — alle Werte stehen zusätzlich in den Tabellen.

## 6. Do's and Don'ts

### Do:
- **Do** jede Zahl mit Urteil liefern: Rendite ≥ 4 % grün hervorheben, Ausreißer rot markieren, Trend-Richtung zeigen — der Leser entscheidet, statt zu rechnen.
- **Do** Zahlenspalten rechtsbündig mit `tabular-nums` setzen (Tabellenziffern-Regel).
- **Do** beide Themes pflegen: Jede neue Farbe braucht einen Light- und einen Dark-Wert im selben Token.
- **Do** Status immer als Farbe + Wortlaut ausdrücken — Farbe ist nie der einzige Träger (WCAG AA, Farbenblindheit).
- **Do** die Serien-Zuordnung einhalten: Kauf = Blau (#2a78d6), Miete = Grün (#1baf7a), überall.
- **Do** Datenqualität sichtbar machen: nicht abfragbare Portale, Stichproben-Charakter und Delisting-Proxys benennen statt verstecken.

### Don't:
- **Don't** Excel-Ästhetik: keine rohen Zahlengitter ohne Hierarchie — Tabellen brauchen gedämpfte Header, Urteils-Hervorhebung und Leseführung (Anti-Referenz aus PRODUCT.md).
- **Don't** Immobilienportal-Optik: keine Foto-Kacheln, Marketing-Badges oder Dringlichkeits-Druck (Anti-Referenz aus PRODUCT.md).
- **Don't** SaaS-Dashboard-Klischee: keine KPI-Kachel-Wände, Gradient-Akzente oder Icon-Karten-Raster (Anti-Referenz aus PRODUCT.md).
- **Don't** Schatten verwenden — das System ist flach (Flach-Regel).
- **Don't** Statusfarben dekorativ einsetzen; Rot/Grün nur, wenn die Zahl ein Urteil trägt (Urteils-Regel). Präzisierung: Die Preisänderung eines Inserats trägt ein Urteil (Senkung = Kaufchance, grün; Erhöhung rot) — die Markt-Tendenz eines Gebiets (Median-Bewegung, ▲/▼/→) ist dagegen ein neutraler Fakt und bleibt in Tintenfarbe; Pfeil und Vorzeichen tragen die Richtung ohne Farbe.
- **Don't** farbige Seitenstreifen (`border-left` > 1px) an Karten, Zeilen oder Hinweisen.
- **Don't** eine zweite Schriftfamilie einführen; Hierarchie kommt aus Größe und Gewicht.
- **Don't** Tinte-leise (#898781) für Fließtext verwenden — es besteht den 4.5:1-Kontrast auf Papier nicht; nur für 600er Labels ≥13px oder unkritische Fußnoten.
