/**
 * Gemeinsames Seitengerüst der Server-Seiten (Suchformular, Historie,
 * Statusseiten). Eigenständiges HTML mit Inline-CSS, gleiche Farbvariablen
 * hell/dunkel wie der Report.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SEITEN_CSS = `
  :root {
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --grid: #e1e0d9;
    --border: rgba(11,11,11,0.10);
    --akzent: #2a78d6;
    --status-critical: #d03b3b;
    --status-good: #2e7d43;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #0d0d0d;
      --surface-1: #1a1a19;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --grid: #2c2c2a;
      --border: rgba(255,255,255,0.10);
      --akzent: #3987e5;
      --status-critical: #d03b3b;
      --status-good: #58b06f;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px;
    background: var(--page); color: var(--text-primary);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 560px; margin: 0 auto; display: grid; gap: 20px; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 15px; margin: 0 0 12px; }
  .meta { color: var(--text-secondary); font-size: 13px; }
  section {
    background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px;
  }
  form { display: grid; gap: 16px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
  legend, label.feld { font-weight: 600; font-size: 13px; padding: 0; }
  .hinweis { color: var(--text-muted); font-size: 12px; }
  select, input[type="number"], input[type="text"] {
    width: 100%; padding: 8px 10px; font: inherit;
    color: var(--text-primary); background: var(--page);
    border: 1px solid var(--grid); border-radius: 6px;
  }
  .bereich { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .radios { display: flex; gap: 16px; }
  .radios label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  button {
    padding: 10px 16px; font: inherit; font-weight: 600;
    color: #fff; background: var(--akzent);
    border: 0; border-radius: 6px; cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: wait; }
  #status { color: var(--text-secondary); font-size: 13px; display: none; }
  .fehler { color: var(--status-critical); }
  a { color: var(--akzent); }
  table.historie { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.historie th, table.historie td {
    padding: 6px 8px; text-align: left; vertical-align: top;
    border-bottom: 1px solid var(--grid);
  }
  table.historie th { color: var(--text-muted); font-weight: 600; }
  table.historie tr:last-child td { border-bottom: 0; }
  .status-badge { font-size: 12px; font-weight: 600; white-space: nowrap; }
  .status-laufend { color: var(--akzent); }
  .status-fertig { color: var(--status-good); }
  .status-fehlgeschlagen { color: var(--status-critical); }
`;

export function seite(titel: string, inhalt: string, kopfExtra = ''): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>immo-radar · ${escapeHtml(titel)}</title>
<style>${SEITEN_CSS}</style>
${kopfExtra}</head>
<body>
<main>
${inhalt}
</main>
</body>
</html>`;
}
