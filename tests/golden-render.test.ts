import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderDashboardSeite } from '../src/pages/dashboard-page.js';
import { renderInserateSeite } from '../src/pages/inserate-page.js';
import { renderLoginSeite } from '../src/pages/login-page.js';
import { renderTopPicksSeite } from '../src/pages/top-picks-page.js';
import { dashboard, inserate, loginFehler, loginLeer, stripStyle, topPicks } from './golden/fixtures.js';

/**
 * Byte-Diff-Netz für die UI-Primitives-Migration: Die Goldens unter
 * tests/golden/*.html sind aus dem dev-Stand (Pre-Migration, cc4e46c) mit
 * denselben Fixtures gerendert, <style>-Block gestrippt. Alles außerhalb
 * des Style-Blocks muss byte-identisch bleiben — toContain-Substring-Tests
 * würden Drift daneben grün durchlaufen lassen.
 *
 * Bei einem Fehlschlag NICHT einfach das Golden neu erzeugen: Der Diff ist
 * entweder ein Migrations-Bug oder eine bewusste Markup-Änderung, die im
 * PR sichtbar begründet gehört (dann Golden gezielt aktualisieren).
 */
function golden(name: string): string {
  return readFileSync(new URL(`./golden/${name}.html`, import.meta.url), 'utf8');
}

describe('Golden-Render (byte-identisch zu dev außerhalb von <style>)', () => {
  it('Login leer', () => {
    expect(stripStyle(renderLoginSeite(loginLeer))).toBe(golden('login-leer'));
  });

  it('Login mit Fehler, Benutzer und Return-Pfad', () => {
    expect(stripStyle(renderLoginSeite(loginFehler))).toBe(golden('login-fehler'));
  });

  it('Dashboard mit Filterleiste, Drawer und Blätter-Nav', () => {
    expect(stripStyle(renderDashboardSeite(dashboard))).toBe(golden('dashboard'));
  });

  it('Inserate mit Filterleiste und Blätter-Nav (Seite 2 von 3)', () => {
    expect(stripStyle(renderInserateSeite(inserate))).toBe(golden('inserate'));
  });

  it('Top Picks mit Filterleiste', () => {
    expect(stripStyle(renderTopPicksSeite(topPicks))).toBe(golden('top-picks'));
  });
});
