/**
 * Gemeinsames Seitengerüst und Design-Tokens aller Server-Seiten und des
 * Reports. TOKEN_CSS und BASIS_CSS sind die eine Quelle für Farben,
 * Typografie, Navbar, Tabellen, Badges und Fokus-Zustände – Seiten ergänzen
 * nur seitenspezifisches CSS (Formulare, Tiles, Charts) über `extraCss`.
 *
 * Alle Text-Farbpaare sind AA-geprüft (≥ 4,5:1 in beiden Themes);
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
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --grid: #e1e0d9;
    --baseline: #c3c2b7;
    --border: rgba(11,11,11,0.10);
    --akzent: #1a66c4;
    --akzent-flaeche: #1a66c4;
    --series-kauf: #2a78d6;
    --series-miete: #1baf7a;
    --series-3: #eda100;
    --status-critical: #d03b3b;
    --status-good: #2e7d43;
    --good-text: #006300;
    --good-bg: rgba(12,163,12,0.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0d0d0d;
      --surface-1: #1a1a19;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --grid: #2c2c2a;
      --baseline: #383835;
      --border: rgba(255,255,255,0.10);
      --akzent: #3987e5;
      --akzent-flaeche: #2a6fc9;
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
    position: sticky; top: 0; z-index: 1; /* über dem Seiteninhalt, sonst gibt es keine Ebenen */
    display: flex; align-items: baseline; gap: 20px; flex-wrap: wrap;
    padding: 12px 24px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--baseline);
  }
  .hauptnav a { text-decoration: none; }
  .hauptnav a:hover { text-decoration: underline; }
  .hauptnav .marke { color: var(--text-primary); font-weight: 600; margin-right: 8px; }
  .hauptnav a[aria-current="page"] { color: var(--text-primary); font-weight: 600; }
  main {
    max-width: calc(560px + 2 * 24px); margin: 0 auto; padding: 24px;
    display: grid; gap: 20px;
  }
  main.breit { max-width: calc(1080px + 2 * 24px); }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .meta { color: var(--text-secondary); font-size: 13px; }
  section {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px;
  }
  a { color: var(--akzent); }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid var(--akzent); outline-offset: 2px;
  }
  button {
    padding: 10px 16px; font: inherit; font-weight: 600;
    color: #fff; background: var(--akzent-flaeche);
    border: 0; border-radius: 6px; cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: wait; }
  button.klein {
    padding: 4px 10px; font-size: 12px; font-weight: 400;
    color: var(--akzent); background: transparent;
    border: 1px solid var(--grid);
  }
  button.klein.kritisch { color: var(--status-critical); }
  .aktionen { display: flex; gap: 6px; }
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
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td .sub, tbody th .sub {
    display: block; font-weight: 400; font-size: 12px; color: var(--text-secondary);
  }
  .status-badge { font-size: 12px; font-weight: 600; white-space: nowrap; }
  .status-laufend { color: var(--akzent); }
  .status-fertig { color: var(--status-good); }
  .status-fehlgeschlagen { color: var(--status-critical); }
  .status-aktiv { color: var(--status-good); }
  .status-inaktiv { color: var(--text-muted); }
  .fehler { color: var(--status-critical); }
  footer { color: var(--text-secondary); font-size: 12px; }
  footer p { margin: 4px 0; }
`;

/** Zusätzliches CSS der Formularseiten (Suchformular, Gebiet anlegen). */
export const FORMULAR_CSS = `
  form { display: grid; gap: 16px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
  legend, label.feld { font-weight: 600; font-size: 13px; padding: 0; }
  .hinweis { color: var(--text-secondary); font-size: 12px; font-weight: 400; }
  .feld-fehler { color: var(--status-critical); font-size: 12px; font-weight: 600; }
  select, input[type="number"], input[type="text"] {
    width: 100%; padding: 8px 10px; font: inherit;
    color: var(--text-primary); background: var(--page);
    border: 1px solid var(--grid); border-radius: 6px;
  }
  .bereich { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .radios { display: flex; gap: 16px; }
  .radios label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  #status { color: var(--text-secondary); font-size: 13px; display: none; }
`;

/** Eintrag der Hauptnavigation, der als aktuelle Seite markiert wird. */
export type NavAktiv = 'suche' | 'gebiete' | 'suchen';

const NAV_EINTRAEGE: ReadonlyArray<readonly [NavAktiv, string, string]> = [
  ['suche', '/', 'Suche'],
  ['gebiete', '/gebiete', 'Beobachtungsgebiete'],
  ['suchen', '/suchen', 'Suchhistorie'],
];

function renderNavbar(aktiv: NavAktiv | undefined): string {
  const links = NAV_EINTRAEGE.map(
    ([key, href, label]) =>
      `<a href="${href}"${key === aktiv ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('\n  ');
  return `<nav class="hauptnav" aria-label="Hauptnavigation">
  <a class="marke" href="/">immo-radar</a>
  ${links}
</nav>`;
}

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

export function seite(titel: string, inhalt: string, opts: SeitenOptionen = {}): string {
  const nav = opts.navbar === false ? '' : `${renderNavbar(opts.aktiv)}\n`;
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
</body>
</html>`;
}
