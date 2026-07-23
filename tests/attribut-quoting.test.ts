import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard für die Attribut-Quoting-Invariante aus src/pages/ui/html.ts:
 * `escapeHtml` escapet `'` bewusst NICHT – interpolierte untrusted Werte
 * sind deshalb nur in doppelt gequoteten Attributen sicher. Ein einfach
 * gequotetes Attribut mit Interpolation (`name='${wert}'`) wäre ausbrechbar.
 *
 * Der Test scannt die Quelltexte (nicht das gerenderte HTML): billig, und
 * er fängt den Verstoß schon beim Schreiben statt erst bei einem Exploit.
 */
const WURZEL = new URL('..', import.meta.url).pathname;

function uiDateien(): string[] {
  const uiVerzeichnis = join(WURZEL, 'src/pages/ui');
  return readdirSync(uiVerzeichnis)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join('src/pages/ui', name));
}

/** Die auf den Primitive-Layer migrierten Flächen + das Layout selbst. */
const MIGRIERTE_SEITEN = [
  'src/pages/layout.ts',
  'src/pages/login-page.ts',
  'src/pages/inserate-page.ts',
  'src/pages/dashboard-page.ts',
  'src/pages/top-picks-page.ts',
  'src/pages/konto-page.ts',
];

/**
 * `='` direkt oder mit Attributwert-Präfix vor einer `${…}`-Interpolation.
 * Bewusst grob (scannt auch Nicht-Template-Code) – aktuell 0 Treffer, und
 * ein False-Positive wäre ein leicht lesbarer Testfehler mit Datei:Zeile.
 */
const MUSTER = [/='\$\{/, /=\s*'[^'"\n>]*\$\{/];

function verstoesse(datei: string): string[] {
  const zeilen = readFileSync(join(WURZEL, datei), 'utf8').split('\n');
  const treffer: string[] = [];
  zeilen.forEach((zeile, i) => {
    // Reine Kommentarzeilen dürfen das Muster als Negativ-Beispiel zitieren
    // (so dokumentiert html.ts die Invariante selbst).
    const getrimmt = zeile.trimStart();
    if (getrimmt.startsWith('//') || getrimmt.startsWith('*') || getrimmt.startsWith('/*')) return;
    if (MUSTER.some((muster) => muster.test(zeile))) {
      treffer.push(`${datei}:${i + 1}  ${zeile.trim()}`);
    }
  });
  return treffer;
}

describe('Attribut-Quoting-Invariante (einfach gequotete Attribute mit Interpolation verboten)', () => {
  it('src/pages/ui/*.ts und die migrierten Seiten sind frei von =\'${…}-Mustern', () => {
    const dateien = [...uiDateien(), ...MIGRIERTE_SEITEN];
    expect(dateien.length).toBeGreaterThanOrEqual(MIGRIERTE_SEITEN.length + 5);
    const alle = dateien.flatMap(verstoesse);
    expect(alle, `Einfach gequotete Attribute mit Interpolation gefunden:\n${alle.join('\n')}`).toEqual([]);
  });
});
