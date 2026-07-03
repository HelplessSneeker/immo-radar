# immo-radar

Immobilienmarkt-Analyse für Anlageobjekte in Österreich. Architektur, Befehle und Datenmodell: siehe [README.md](README.md).

## Design Context

- **[PRODUCT.md](PRODUCT.md)** — Register (product), Nutzer, Markenpersönlichkeit, Anti-Referenzen und die 5 Design-Prinzipien. Vor UI-Arbeit lesen.
- **[DESIGN.md](DESIGN.md)** — Das visuelle System („Das ruhige Marktbüro"): Farbtokens (hell/dunkel), Typografie, Komponenten-Vokabular, Do's & Don'ts. Die Tokens leben im Code in `src/pages/layout.ts`, `src/pages/gebiete-pages.ts` und `src/report.ts` — Änderungen dort und in DESIGN.md synchron halten.

Kurzfassung der Prinzipien: Zahlen mit Urteil liefern (Schwellen hervorheben, Ausreißer markieren); Dichte mit Leseführung; vertraute Standard-Affordances statt Originalität; ehrlich über Datenqualität; auch für Nicht-Techniker lesbar. Anti-Referenzen: Excel-Ästhetik, Portal-Optik, SaaS-Dashboard-Klischee.
