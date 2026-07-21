/**
 * Gemeinsames Seitengerüst und Design-Tokens aller Server-Seiten und des
 * Reports. TOKEN_CSS und BASIS_CSS sind die eine Quelle für Farben,
 * Typografie, Navbar, Tabellen, Badges und Fokus-Zustände – Seiten ergänzen
 * nur seitenspezifisches CSS (Formulare, Tiles, Charts) über `extraCss`.
 *
 * Alle normalgroßen Text-Farbpaare sind AA-geprüft (≥ 4,5:1 in beiden Themes)
 * auf ihrem tatsächlichen Grund (Statustexte sitzen in Sections/Tabellen auf
 * --surface-1, nicht auf dem cremigen --page). Einzige Ausnahme: die
 * Fehlerseiten-h1 in --status-critical steht auf --page (4,33:1) – als
 * 20px/600-Überschrift Large-Text und damit AA über die 3:1-Schwelle.
 * --text-muted bleibt wie dokumentiert auf Bold-Labels/Fußnoten beschränkt.
 * Änderungen an den Tokens mit DESIGN.md synchron halten.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Farb-Tokens hell/dunkel. --akzent trägt Text (Links, Ghost-Buttons, Fokus,
 * Status „läuft"), --akzent-flaeche Flächen mit weißem Text (Primärbutton) –
 * im Dark-Theme brauchen die zwei Rollen unterschiedliche Blautöne, damit
 * beide AA bestehen. Die Serienfarben (--series-*) sind reine Chart-Farben.
 */
export const TOKEN_CSS = `
  :root {
    /* Native Widget-Teile (Datums-Picker, Select-Dropdown, Scrollbars) sollen
       dem aktiven Theme folgen – ohne color-scheme rendert der Browser sie
       immer hell, auch im Dark-Theme. */
    color-scheme: light dark;
    /* Papier ist bewusst cremiger als die Fläche (nicht nur ~1 % heller wie
       zuvor #f9f9f7/#fcfcfb): so heben sich Sections und Tiles sichtbar vom
       Seitengrund ab, ohne Schatten (Flach-Regel). Wärmer, aber weit weg von
       Portal-Weiß. */
    --page: #f5f3ec;
    --surface-1: #fcfbf7;
    --surface-hover: rgba(11,11,11,0.035);
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --grid: #e1e0d9;
    --baseline: #c3c2b7;
    --border: rgba(11,11,11,0.12);
    --akzent: #1a66c4;
    --akzent-flaeche: #1a66c4;
    --akzent-flaeche-hover: #155aab;
    --series-kauf: #2a78d6;
    --series-miete: #1baf7a;
    --series-3: #eda100;
    --status-critical: #d03b3b;
    --status-good: #2e7d43;
    --good-text: #006300;
    --good-bg: rgba(12,163,12,0.08);
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --dauer-fein: 120ms;
    --dauer-schnell: 180ms;
    --dauer-mittel: 240ms;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0d0d0d;
      --surface-1: #1a1a19;
      --surface-hover: rgba(255,255,255,0.045);
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --grid: #2c2c2a;
      --baseline: #383835;
      --border: rgba(255,255,255,0.10);
      --akzent: #3987e5;
      --akzent-flaeche: #2a6fc9;
      --akzent-flaeche-hover: #3a80d6;
      --series-kauf: #3987e5;
      --series-miete: #199e70;
      --series-3: #c98500;
      --status-critical: #e35d5d;
      --status-good: #58b06f;
      --good-text: #0ca30c;
      --good-bg: rgba(12,163,12,0.14);
    }
  }
`;

/** Grundgerüst: Typografie, Navbar, Sections, Links, Fokus, Buttons, Tabellen, Badges. */
export const BASIS_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--page); color: var(--text-primary);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .hauptnav {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
    padding: 10px 24px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--baseline);
  }
  .hauptnav a { display: inline-flex; align-items: center; gap: 7px; text-decoration: none; transition: color var(--dauer-fein) var(--ease-out); }
  .hauptnav a:hover { text-decoration: underline; }
  .hauptnav a svg { width: 16px; height: 16px; flex: none; color: var(--text-secondary); transition: color var(--dauer-fein) var(--ease-out); }
  .hauptnav a:hover svg { color: var(--text-primary); }
  .hauptnav .marke { color: var(--text-primary); font-weight: 600; margin-right: 8px; }
  .hauptnav a[aria-current="page"] { color: var(--text-primary); font-weight: 600; }
  .hauptnav a[aria-current="page"] svg { color: var(--text-primary); }
  main {
    max-width: calc(560px + 2 * 24px); margin: 0 auto; padding: 24px;
    display: grid; gap: 20px;
  }
  main.breit { max-width: calc(1080px + 2 * 24px); }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .meta { color: var(--text-secondary); font-size: 13px; }
  /* Begrüßungs-/Orientierungszeile im Seitenkopf: sitzt in der Hierarchie
     zwischen h1 (20px, Tinte) und der grauen Herkunfts-Meta – plain language
     für Nicht-Techniker, ohne die stille Anmutung zu brechen. */
  .intro { font-size: 14px; line-height: 1.5; color: var(--text-primary); margin: 6px 0 0; max-width: 64ch; }
  .intro + .meta { margin-top: 6px; }
  section {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px;
    /* Grid-Kind: ohne min-width 0 kann die Section nicht unter die
       Tabellen-Eigenbreite schrumpfen und die ganze Seite scrollt seitlich –
       scrollen soll nur .tabelle-scroll. */
    min-width: 0;
  }
  a { color: var(--akzent); transition: color var(--dauer-fein) var(--ease-out); }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid var(--akzent); outline-offset: 2px;
    transition: outline-offset var(--dauer-fein) var(--ease-out);
  }
  button {
    padding: 10px 16px; font: inherit; font-weight: 600;
    color: #fff; background: var(--akzent-flaeche);
    border: 0; border-radius: 6px; cursor: pointer;
    transition: background-color var(--dauer-schnell) var(--ease-out),
                opacity var(--dauer-schnell) var(--ease-out);
  }
  button:hover:not(:disabled) { background: var(--akzent-flaeche-hover); }
  button:active:not(:disabled) { background: var(--akzent-flaeche-hover); opacity: 0.9; }
  button:disabled { opacity: 0.6; cursor: wait; }
  button.klein {
    padding: 4px 10px; font-size: 12px; font-weight: 400;
    color: var(--akzent); background: transparent;
    border: 1px solid var(--grid);
    transition: background-color var(--dauer-schnell) var(--ease-out),
                border-color var(--dauer-schnell) var(--ease-out),
                color var(--dauer-schnell) var(--ease-out);
  }
  button.klein:hover:not(:disabled) { background: var(--surface-hover); border-color: var(--baseline); }
  button.klein.kritisch { color: var(--status-critical); }
  button.klein.kritisch:hover:not(:disabled) { border-color: var(--status-critical); }
  .aktionen { display: flex; gap: 6px; flex-wrap: nowrap; }
  .aktionen button { white-space: nowrap; flex-shrink: 0; }
  .sr-nur {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip-path: inset(50%); white-space: nowrap;
  }
  .tabelle-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td {
    text-align: left; padding: 6px 10px; vertical-align: top;
    border-bottom: 1px solid var(--grid);
  }
  thead th { color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--baseline); }
  tbody th { font-weight: 600; }
  tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
  tbody tr { transition: background-color var(--dauer-fein) var(--ease-out); }
  tbody tr:hover { background: var(--surface-hover); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td .sub, tbody th .sub {
    display: block; font-weight: 400; font-size: 12px; color: var(--text-secondary);
  }
  /* Mobile-Karten: dichte Tabellen (Top Picks, Datenpunkte, Portfolio) brechen
     auf schmalen Viewports in gestapelte Karten um – je Zeile eine Karte, die
     Spaltenköpfe wandern als data-label vor den Wert. Opt-in via .tabelle-karten,
     damit reine Übersichts-Tabellen (Inserate, Crawl) beim Scroll-Layout bleiben. */
  @media (max-width: 640px) {
    .tabelle-karten thead {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
    .tabelle-karten, .tabelle-karten tbody, .tabelle-karten tr, .tabelle-karten td { display: block; width: auto; }
    .tabelle-karten tr {
      border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin: 0 0 10px;
    }
    .tabelle-karten tr:last-child { margin-bottom: 0; }
    .tabelle-karten tr:hover { background: none; }
    .tabelle-karten td { display: flow-root; border: 0; padding: 5px 0; text-align: right; }
    .tabelle-karten td::before {
      content: attr(data-label); float: left; padding-right: 12px;
      color: var(--text-secondary); font-weight: 600; text-align: left;
    }
    /* Erste Zelle = Karten-Titel: linksbündig, kein Label. */
    .tabelle-karten td:first-child { text-align: left; padding-top: 0; font-weight: 600; }
    .tabelle-karten td:first-child::before { content: none; }
    .tabelle-karten td:last-child { padding-bottom: 0; }
    .tabelle-karten td .sub { text-align: right; }
    .tabelle-karten td:first-child .sub { text-align: left; }
    /* Ausreißer-Tönung wandert auf die Karte statt auf jede Teil-Zelle. */
    .tabelle-karten tr.row-outlier { background: color-mix(in srgb, var(--status-critical) 6%, transparent); }
    .tabelle-karten tr.row-outlier td { background: none; }
  }
  .status-badge {
    font-size: 12px; font-weight: 600; white-space: nowrap;
    transition: color var(--dauer-schnell) var(--ease-out);
  }
  .status-laufend { color: var(--akzent); }
  .status-fertig { color: var(--status-good); }
  .status-fehlgeschlagen { color: var(--status-critical); }
  .status-aktiv { color: var(--status-good); }
  .status-inaktiv { color: var(--text-muted); }
  /* delistet ist kein Fehler, sondern ein neutraler Lebenszyklus-Zustand –
     gedämpft wie „inaktiv", das Wort trägt die Bedeutung. */
  .status-delistet { color: var(--text-muted); }
  /* Preisänderungen aus Käufer-Sicht: Senkung = Chance (grün), Erhöhung =
     kritisch. Das Vorzeichen trägt das Urteil auch ohne Farbe. */
  .gesenkt { color: var(--status-good); font-weight: 600; }
  .gestiegen { color: var(--status-critical); font-weight: 600; }
  /* Site-weite Badges und Ausreißer-Zeilen (Dashboard-Datenpunkte, Top Picks,
     Report): .badge ist neutrale Herkunft/Fakt, .badge-critical das Urteil
     „auffällig", .row-outlier hinterlegt die ganze Zeile leise kritisch. */
  .badge { font-size: 12px; color: var(--text-secondary); }
  .badge-critical { color: var(--status-critical); font-weight: 600; font-size: 12px; }
  .row-outlier td { background: color-mix(in srgb, var(--status-critical) 6%, transparent); }
  .fehler { color: var(--status-critical); }
  footer { color: var(--text-secondary); font-size: 12px; }
  footer p { margin: 4px 0; }

  /* Puls für die „läuft"-Zustände – der einzige rein motorische Effekt im System,
     bewusst leise (Opazitäts-Wechsel, kein Skalieren). Bei Status-Badges nur in
     Tabellen-Kontext (Zeilen-Status), damit statische Kopf-Beschriftungen ruhig bleiben. */
  .status-badge.status-laufend::before,
  .aktivitaet-punkt {
    content: "";
    display: inline-block;
    width: 6px; height: 6px; margin-right: 6px;
    border-radius: 50%;
    background: currentColor;
    vertical-align: 1px;
    animation: puls-laufend 1.8s ease-in-out infinite;
  }
  .aktivitaet-punkt { background: var(--akzent); margin: 0; vertical-align: 0; }
  @keyframes puls-laufend {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }

  /* Indeterminate Progress: dünner Streifen, der über die Bahn wandert.
     Bewusst schmal (2px) und ohne Farb-Verlauf – wir wissen die Dauer nicht,
     kein Fortschritts-Theater. */
  .fortschritt {
    position: relative; height: 2px; overflow: hidden;
    background: var(--grid); border-radius: 1px;
  }
  .fortschritt::before {
    content: ""; position: absolute; inset: 0 auto 0 0;
    width: 32%; background: var(--akzent);
    animation: fortschritt-lauf 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  @keyframes fortschritt-lauf {
    0%   { left: -32%; }
    100% { left: 100%; }
  }

  /* Aktivitäts-Chip in der Kopfzeile: schrumpft alles Laufende auf ein
     einzelnes, jederzeit anklickbares Element im Kopf. Rechts angeschlagen
     per margin-left: auto (wandert bei flex-wrap sauber mit). */
  .aktivitaet-slot { position: relative; margin-left: auto; }
  .aktivitaet-slot[hidden] { display: none; }
  /* button.aktivitaet-chip statt .aktivitaet-chip: die generischen
     button-Regeln oben (background, hover) haben höhere Spezifität als eine
     reine Klasse und würden sonst den Chip in Blau umfärben. */
  button.aktivitaet-chip {
    padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 600;
    color: var(--akzent); background: transparent;
    border: 1px solid var(--grid); border-radius: 999px;
    display: inline-flex; align-items: center; gap: 8px;
    cursor: pointer;
    transition: background-color var(--dauer-schnell) var(--ease-out),
                border-color var(--dauer-schnell) var(--ease-out);
  }
  button.aktivitaet-chip:hover:not(:disabled) {
    background: var(--surface-hover); border-color: var(--baseline);
  }
  button.aktivitaet-chip[aria-expanded="true"] {
    background: var(--surface-hover); border-color: var(--baseline);
  }
  .aktivitaet-liste {
    position: absolute; right: 0; top: calc(100% + 6px);
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 0;
    min-width: 260px; max-width: 360px; z-index: 10;
    transform-origin: top right;
    animation: aktivitaet-oeffnen var(--dauer-schnell) var(--ease-out);
  }
  .aktivitaet-liste[hidden] { display: none; }
  .aktivitaet-liste ul { list-style: none; margin: 0; padding: 0; }
  .aktivitaet-liste a { display: flex; align-items: baseline; gap: 8px; padding: 6px 14px; text-decoration: none; color: var(--text-primary); font-size: 13px; }
  .aktivitaet-liste a:hover { background: var(--surface-hover); text-decoration: none; }
  .aktivitaet-liste .aktivitaet-titel {
    display: block; font-size: 11px; font-weight: 600; color: var(--text-muted);
    padding: 4px 14px 2px; text-transform: uppercase; letter-spacing: 0.04em;
    margin: 0;
  }
  .aktivitaet-liste .aktivitaet-titel + ul { margin-bottom: 4px; }
  .aktivitaet-liste .aktivitaet-punkt-mini {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: var(--akzent);
    animation: puls-laufend 1.8s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes aktivitaet-oeffnen {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Seiten-Navigation (Blättern): reine Textlinks statt Buttons, in der Mitte
     der Zähler. Am Rand (erste/letzte Seite) entfällt der jeweilige Link
     ersatzlos – ein leerer Span hält die Ausrichtung, kein Disabled-Fake. */
  .seiten-nav {
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
  }
  .seiten-nav .zaehler { font-variant-numeric: tabular-nums; }

  /* Filterleiste: inline GET-Formular über Auswertungstabellen. Filter sind
     Query-Parameter und funktionieren ohne JS. */
  .filterleiste {
    display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end;
  }
  .filterleiste .feld { display: grid; gap: 6px; }
  .filterleiste label, .filterleiste legend { font-weight: 600; font-size: 13px; }
  .filterleiste fieldset { border: 0; padding: 0; margin: 0; }
  /* Bereichs-Felder (von–bis) in der Filterleiste: ein Label, zwei kompakte
     Eingaben – die Feldbreite folgt dem Inhalt (PLZ, m², Datum), nicht dem
     Browser-Default; sonst wirken kurze Werte in 200px-Boxen verloren. */
  .filterleiste .von-bis { display: flex; gap: 8px; }
  .filterleiste .feld-plz input { width: 150px; }
  .filterleiste .von-bis input[type="text"] { width: 76px; }
  .filterleiste .von-bis input[type="date"] { width: 145px; }
  .filterleiste select, .filterleiste input[type="text"], .filterleiste input[type="date"] {
    padding: 6px 10px; font: inherit; font-size: 13px;
    color: var(--text-primary); background: var(--page);
    border: 1px solid var(--grid); border-radius: 6px;
    transition: border-color var(--dauer-schnell) var(--ease-out);
  }
  .filterleiste select:hover:not(:focus), .filterleiste input[type="text"]:hover:not(:focus),
  .filterleiste input[type="date"]:hover:not(:focus) {
    border-color: var(--baseline);
  }
  .filterleiste select:focus, .filterleiste input[type="text"]:focus,
  .filterleiste input[type="date"]:focus {
    border-color: var(--akzent);
  }
  .filterleiste button { margin-bottom: 1px; }
  /* Mehrfach-Facette (Ausstattung): zugeklapptes natives <details> in der
     Leiste — Summary wie die Dashboard-Filter-Summary (13px/600 in Akzent);
     aufgeklappt nimmt das Checkbox-Grid eine eigene volle Formularzeile ein. */
  .filterleiste .feld-ausstattung summary {
    cursor: pointer; font-size: 13px; font-weight: 600; color: var(--akzent);
    padding-bottom: 6px;
  }
  .filterleiste .feld-ausstattung summary:hover { text-decoration: underline; }
  .filterleiste .feld-ausstattung[open] { flex-basis: 100%; }
  .filterleiste .feld-ausstattung[open] summary { padding-bottom: 10px; }
  .filterleiste .facetten-panel {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 4px 16px;
  }
  .filterleiste .facetten-panel label { font-weight: 400; }

  /* Sanftes Ausblenden vor einem Reload – der harte Cut wirkt sonst als „Ruckler",
     besonders wenn eine Suche/ein Crawl gerade fertig geworden ist und die Seite
     sich neu lädt. Wird per JS an body gesetzt, kurz bevor location.reload
     ausgelöst wird. */
  body.laufend-fade main {
    opacity: 0.35; transition: opacity var(--dauer-mittel) var(--ease-out);
  }

  /* Motion-Reduction: alles, was rein motorisch ist, ausschalten.
     Zustands-Farbübergänge dürfen bleiben (verletzen kein reduced-motion). */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
    }
    .fortschritt::before { animation: none; width: 100%; opacity: 0.3; }
    .status-badge.status-laufend::before,
    .aktivitaet-punkt,
    .aktivitaet-liste .aktivitaet-punkt-mini { animation: none; opacity: 0.8; }
  }
`;

/** Zusätzliches CSS der Formularseiten (Suchformular, Gebiet anlegen). */
export const FORMULAR_CSS = `
  form { display: grid; gap: 16px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
  legend, label.feld { font-weight: 600; font-size: 13px; padding: 0; }
  .hinweis { color: var(--text-secondary); font-size: 12px; font-weight: 400; }
  .feld-fehler { color: var(--status-critical); font-size: 12px; font-weight: 600; }
  select, input[type="number"], input[type="text"], input[type="password"], input[type="date"] {
    width: 100%; padding: 8px 10px; font: inherit;
    color: var(--text-primary); background: var(--page);
    border: 1px solid var(--grid); border-radius: 6px;
    transition: border-color var(--dauer-schnell) var(--ease-out);
  }
  select:hover:not(:focus), input[type="number"]:hover:not(:focus), input[type="date"]:hover:not(:focus),
  input[type="text"]:hover:not(:focus), input[type="password"]:hover:not(:focus) { border-color: var(--baseline); }
  select:focus, input[type="number"]:focus, input[type="text"]:focus, input[type="password"]:focus,
  input[type="date"]:focus { border-color: var(--akzent); }
  .bereich { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  /* Nachbar-Fieldsets in .bereich haben oft eine Hint-Zeile nur auf einer Seite
     (z. B. "leer lassen = leerstehend" bei der Kaltmiete, nicht bei Baujahr).
     Ohne diesen Ausgleich sitzt der eine Input höher als der andere. Flex mit
     margin-top: auto drückt den Input zuverlässig an den unteren Rand des
     (grid-stretched) Fieldsets, unabhängig davon, ob ein Hint dazwischen liegt. */
  .bereich > fieldset { display: flex; flex-direction: column; gap: 6px; }
  .bereich > fieldset > input,
  .bereich > fieldset > select { margin-top: auto; }
  .radios { display: flex; gap: 16px; }
  .radios label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  /* Absende-Button mit „läuft"-Zustand: der Text wird ausgetauscht, das
     Puls-Punkt-Element vom Aktivitäts-Chip taucht auf. Kein separater Status-
     Absatz mehr – die Aktion und ihre Rückmeldung leben in derselben Zeile. */
  button.laeuft { cursor: wait; }
  button.laeuft .senden-puls {
    display: inline-block; width: 6px; height: 6px; margin-right: 8px;
    border-radius: 50%; background: currentColor; vertical-align: 1px;
    animation: puls-laufend 1.4s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    button.laeuft .senden-puls { animation: none; opacity: 0.8; }
  }
`;

/** Eintrag der Hauptnavigation, der als aktuelle Seite markiert wird. */
export type NavAktiv = 'dashboard' | 'top-picks' | 'inserate' | 'portfolio' | 'crawl';

const NAV_EINTRAEGE: ReadonlyArray<readonly [NavAktiv, string, string]> = [
  ['dashboard', '/', 'Dashboard'],
  ['top-picks', '/top-picks', 'Top Picks'],
  ['inserate', '/inserate', 'Inserate'],
  ['portfolio', '/portfolio', 'Portfolio'],
  ['crawl', '/crawl', 'Crawl-Läufe'],
];

// Lucide-Icons (24er-viewBox, currentColor). Bewusst monochrom und in
// text-secondary getönt – die Farbe bleibt für Labels/Zahlen reserviert, die
// Ikonografie dient nur der schnellen visuellen Orientierung für Nicht-Techniker.
const NAV_ICON_PFADE: Record<NavAktiv, string> = {
  dashboard: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  'top-picks':
    '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  inserate:
    '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  portfolio:
    '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  crawl:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
};

function navIcon(key: NavAktiv): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${NAV_ICON_PFADE[key]}</svg>`;
}

function renderNavbar(aktiv: NavAktiv | undefined): string {
  const links = NAV_EINTRAEGE.map(
    ([key, href, label]) =>
      `<a href="${href}"${key === aktiv ? ' aria-current="page"' : ''}>${navIcon(key)}<span>${label}</span></a>`,
  ).join('\n  ');
  // Der Aktivitäts-Slot ist per default versteckt und wird vom Poll-Script
  // sichtbar, sobald `/api/laufend` etwas Laufendes meldet. Bewusst als kompaktes
  // Chip im Kopf statt als schwerer Overlay – Werkzeug, nicht Dashboard.
  return `<nav class="hauptnav" aria-label="Hauptnavigation">
  <a class="marke" href="/">immo-radar</a>
  ${links}
  <div class="aktivitaet-slot" id="aktivitaet-slot" hidden>
    <button type="button" class="aktivitaet-chip" aria-expanded="false" aria-controls="aktivitaet-liste" aria-label="Laufenden Crawl anzeigen">
      <span class="aktivitaet-punkt" aria-hidden="true"></span>
      <span class="aktivitaet-text">läuft</span>
    </button>
    <div class="aktivitaet-liste" id="aktivitaet-liste" role="region" aria-label="Aktuelle Aktivität" hidden></div>
  </div>
</nav>`;
}

/**
 * Client-Script für den Aktivitäts-Chip in der Kopfzeile. Wird auf jeder Seite
 * eingebettet (nur wenn die Seite mit Navbar rendert). Pollt `/api/laufend` alle
 * 3 Sekunden und aktualisiert Chip + Dropdown. Feuert bei jeder Änderung ein
 * `aktivitaet-aenderung`-CustomEvent auf `document`, damit seitenspezifische
 * Skripte (z. B. Badge-Refresh in der Gebiete-Liste) darauf reagieren können,
 * ohne selbst nochmal zu pollen.
 */
export const AKTIVITAET_JS = `
<script>
(function () {
  'use strict';
  const slot = document.getElementById('aktivitaet-slot');
  if (!slot) return;
  const chip = slot.querySelector('.aktivitaet-chip');
  const text = slot.querySelector('.aktivitaet-text');
  const liste = slot.querySelector('.aktivitaet-liste');
  let offen = false;
  let letzterHash = '';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function schliesseListe() {
    if (!offen) return;
    offen = false;
    liste.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
  }

  chip.addEventListener('click', function () {
    offen = !offen;
    liste.hidden = !offen;
    chip.setAttribute('aria-expanded', String(offen));
  });
  document.addEventListener('click', function (e) {
    if (offen && !slot.contains(e.target)) schliesseListe();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && offen) { schliesseListe(); chip.focus(); }
  });

  function baueListe(data) {
    let html = '';
    if (data.sweep) {
      html += '<p class="aktivitaet-titel">Crawl</p><ul>';
      html += '<li><a href="/crawl"><span class="aktivitaet-punkt-mini" aria-hidden="true"></span><span>Kärnten-Sweep (' + esc(data.sweep.laufDatum) + ')</span></a></li>';
      html += '</ul>';
    }
    liste.innerHTML = html;
  }

  async function tick() {
    try {
      const res = await fetch('/api/laufend', { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const hash = data.sweep ? data.sweep.laufDatum : '';
      const geaendert = hash !== letzterHash;
      letzterHash = hash;

      if (!data.sweep) {
        if (!slot.hidden) { slot.hidden = true; schliesseListe(); }
      } else {
        if (slot.hidden) slot.hidden = false;
        text.textContent = 'Sweep läuft';
        baueListe(data);
      }
      if (geaendert) {
        document.dispatchEvent(new CustomEvent('aktivitaet-aenderung', { detail: data }));
      }
    } catch (_) { /* Server offline – nächster Tick versucht es wieder */ }
  }

  tick();
  setInterval(tick, 3000);
})();
</script>`;

export interface SeitenOptionen {
  /** Zusätzliche Head-Zeilen (z. B. meta refresh, noscript). */
  kopfExtra?: string;
  /** Seitenspezifisches CSS, nach TOKEN_CSS/BASIS_CSS eingebettet. */
  extraCss?: string;
  /** Inhaltsbreite: 560px für Formulare/Listen (Default), 1080px für Auswertungen. */
  breite?: 'schmal' | 'breit';
  /** Aktiver Navbar-Eintrag; weglassen = Navbar ohne Markierung (Fehler-/Sonderseiten). */
  aktiv?: NavAktiv;
  /** false = ganz ohne Navbar (statisch exportierte Reports ohne laufenden Server). */
  navbar?: boolean;
}

/**
 * Leer-Zustand der Auswertungsseiten (Dashboard, Top Picks), solange noch
 * kein Sweep fertig ist: gleicher Kopf wie im befüllten Zustand (damit der
 * Ton zwischen leer und befüllt konsistent bleibt), identische
 * Sweep-Erklärung mit Fortschritts-Link — nur Titel, Überschrift und
 * Untertitel unterscheiden sich je Seite.
 */
export function renderOhneDatenSeite(optionen: {
  /** <title>-Zusatz, z. B. „Dashboard". */
  titel: string;
  aktiv: NavAktiv;
  /** h1 — wie im befüllten Zustand der Seite (reiner Text, wird escaped). */
  ueberschrift: string;
  /** Meta-Zeile unter der Überschrift (HTML, vom Aufrufer escaped). */
  untertitel: string;
  sweepLaeuft: boolean;
}): string {
  const inhalt = `  <header>
    <h1>${escapeHtml(optionen.ueberschrift)}</h1>
    <p class="meta">${optionen.untertitel}</p>
  </header>
  <section>
    <h2>Noch keine Daten</h2>
    <p class="meta">${
      optionen.sweepLaeuft
        ? 'Der erste Kärnten-Sweep läuft gerade – diese Seite füllt sich, sobald er fertig ist.'
        : 'Der erste Kärnten-Sweep steht noch aus; er startet automatisch (spätestens 30 Minuten nach Serverstart).'
    } Fortschritt: <a href="/crawl">Crawl-Läufe</a></p>
  </section>`;
  return seite(optionen.titel, inhalt, { aktiv: optionen.aktiv });
}

export function seite(titel: string, inhalt: string, opts: SeitenOptionen = {}): string {
  const mitNavbar = opts.navbar !== false;
  const nav = mitNavbar ? `${renderNavbar(opts.aktiv)}\n` : '';
  // Aktivitäts-Chip nur auf Seiten mit Navbar – statisch exportierte Reports
  // haben keinen laufenden Server, dort wäre der Poll ins Leere.
  const aktivitaetsSkript = mitNavbar ? AKTIVITAET_JS : '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>immo-radar · ${escapeHtml(titel)}</title>
<style>${TOKEN_CSS}${BASIS_CSS}${opts.extraCss ?? ''}</style>
${opts.kopfExtra ?? ''}</head>
<body>
${nav}<main${opts.breite === 'breit' ? ' class="breit"' : ''}>
${inhalt}
</main>
${aktivitaetsSkript}
</body>
</html>`;
}
