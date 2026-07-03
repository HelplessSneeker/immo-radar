# Product

## Register

product

## Users

Benjamin und sein enger Kreis (Partner/Familie). Primärnutzer ist ein technisch versierter Investor, der abends am Desktop den österreichischen Wohnungsmarkt analysiert; Ergebnisse (Reports, Gebiets-Auswertungen) werden aber mit Nicht-Technikern geteilt und gemeinsam besprochen. Job to be done: fundierte Kauf-Entscheidungen für Anlageobjekte treffen — sowohl im Ad-hoc-Vergleich („Wo lohnt sich Kaufen gerade?") als auch in der Langzeit-Beobachtung („Wie entwickelt sich mein Gebiet?"). Beide Aufgaben sind gleichwertig.

## Product Purpose

immo-radar lädt Kauf- und Miet-Inserate (Live-Crawl von willhaben.at und immoscout24.at oder CSV/JSON), wertet sie pro Gebiet aus und zeigt Bruttorenditen, €/m²-Vergleiche und Ausreißer. Beobachtungsgebiete bauen einen historisierten Bestand auf (Preisentwicklung, Vermarktungsdauer, Preissenkungen). Erfolg heißt: Auf einen Blick erkennen, wo und wann sich ein Kauf lohnt — mit Zahlen, denen man traut, und ohne Portal-Rauschen.

## Brand Personality

Nüchtern, präzise, vertrauenswürdig. Wie ein gutes Analyse-Terminal: ruhig, zahlengetrieben, ohne Verkaufsdruck. Die Oberfläche verschwindet hinter der Aufgabe; Vertrauen entsteht durch Klarheit und Konsistenz, nicht durch Dekoration. Da Reports auch von Nicht-Technikern gelesen werden: Zahlen immer mit Einordnung (was ist gut, was ist auffällig), nie nackt.

## Anti-references

- **Excel-Ästhetik**: keine rohen Zahlengitter. Tabellen ja — aber mit Hierarchie, Hervorhebung des Entscheidungsrelevanten (Rendite ≥ 4 %, Ausreißer, Preissenkungen) und klarer Leseführung.
- Kein Immobilienportal-Look (Foto-Kacheln, Marketing-Badges, Dringlichkeits-Druck) — immo-radar ist die neutrale Gegenposition zu den Portalen, die es ausliest.
- Kein generisches SaaS-Dashboard (KPI-Kachel-Wände, Gradient-Akzente, Icon-Karten-Raster).

## Design Principles

1. **Die Zahl mit Urteil liefern**: Jede Kennzahl trägt ihre Einordnung mit (hervorgehoben ab Schwelle, Ausreißer markiert, Trend-Richtung sichtbar) — der Leser soll entscheiden, nicht erst rechnen.
2. **Dichte mit Leseführung**: Viele Daten pro Bildschirm sind erwünscht (Vergleich ist der Kern), aber immer mit Hierarchie — Median vor Min/Max, Rendite vor Rohpreis.
3. **Vertraut statt originell**: Standard-Affordances (Formulare, Tabellen, Links), System-Schrift, ruhige Zustände. Wiedererkennung Bildschirm zu Bildschirm schlägt Überraschung.
4. **Ehrlich über Datenqualität**: Portal-Caps, Stichproben-Charakter, nicht abfragbare Portale und Delisting-Proxys sichtbar machen statt verstecken — Vertrauen kommt von Transparenz.
5. **Auch ohne Kontext lesbar**: Reports und Gebiets-Seiten müssen für Mitleser ohne Finanz-/Technik-Hintergrund verständlich sein (Begriffe erklärt, Methodik verlinkt).

## Accessibility & Inclusion

WCAG AA als Grundlinie: Textkontraste ≥ 4.5:1 in beiden Themes (hell/dunkel via `prefers-color-scheme`), vollständige Tastaturbedienung, `prefers-reduced-motion` respektieren. Farbe nie als einziger Informationsträger — besonders in Charts und bei Status-Badges (laufend/fertig/fehlgeschlagen) zusätzlich Text oder Form. Deutsche Sprache, `lang="de"` durchgängig.
