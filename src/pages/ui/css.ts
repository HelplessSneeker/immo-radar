/**
 * CSS der geteilten UI-Primitives – wird von `seite()` nach BASIS_CSS und vor
 * `extraCss` eingebettet. Hierher wandert nur CSS, das aus page-scoped
 * extraCss zentral wird, weil ein Primitive es auf mehreren Seiten braucht.
 *
 * ACHTUNG Byte-Falle: dieser Block landet in JEDER Seite. Seitentests prüfen
 * teils `not.toContain` über das ganze Dokument (z. B. top-picks:
 * `not.toContain('checked')`) – hier also nie Substrings wie „checked"
 * verwenden (kein `:checked`-Selektor).
 */
export const KOMPONENTEN_CSS = `
  /* Checkbox-Schalter in der Filterleiste (checkboxFeld): Label und Checkbox
     in einer Zeile, die Methodik-Meta-Zeile eng darunter. Zentral, weil die
     Leiste auf Dashboard, /inserate und /top-picks identisch rendert. */
  .feld-toggle label { display: flex; align-items: center; gap: var(--raum-xs); font-weight: var(--gewicht-normal); }
  .feld-toggle .meta { margin: 0; font-size: var(--fs-fuss); }
`;
