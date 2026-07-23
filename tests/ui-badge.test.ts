import { describe, expect, it } from 'vitest';
import { badge, statusBadge } from '../src/pages/ui/badge.js';
import { ausreisserBadge } from '../src/pages/format.js';

describe('badge', () => {
  it('neutral vs. kritisch (Urteil nur mit badge-critical)', () => {
    expect(String(badge('Miete: PLZ-Median'))).toBe('<span class="badge">Miete: PLZ-Median</span>');
    expect(String(badge('▲ Ausreißer', true))).toBe('<span class="badge badge-critical">▲ Ausreißer</span>');
  });
});

describe('statusBadge', () => {
  it('rendert die Status-Shape der Bestand-Tabellen', () => {
    expect(String(statusBadge('aktiv', 'aktiv'))).toBe('<span class="status-badge status-aktiv">aktiv</span>');
    expect(String(statusBadge('delistet', 'delistet'))).toBe(
      '<span class="status-badge status-delistet">delistet</span>',
    );
  });
});

describe('ausreisserBadge (format.ts auf badge() umgestellt)', () => {
  it('rendert mit führendem Leerzeichen und Grund byte-identisch zum Ist', () => {
    expect(String(ausreisserBadge({ istAusreisser: true }))).toBe(
      ' <span class="badge badge-critical">▲ Ausreißer</span>',
    );
  });

  it('gibt LEER (length 0) für Nicht-Ausreißer', () => {
    expect(ausreisserBadge({ istAusreisser: false }).length).toBe(0);
  });
});
