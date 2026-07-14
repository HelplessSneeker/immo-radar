import { describe, expect, it } from 'vitest';
import { fmtDelta } from '../src/pages/format.js';

describe('fmtDelta', () => {
  it('positives Delta mit Pluszeichen und einer Nachkommastelle', () => {
    expect(fmtDelta(0.023, 'prozent')).toBe('+2,3 %');
    // Feste Nachkommastelle: 2,0 bleibt 2,0 (kein "+2 %").
    expect(fmtDelta(0.02, 'prozent')).toBe('+2,0 %');
  });

  it('negatives Delta mit echtem Minus (U+2212)', () => {
    expect(fmtDelta(-0.023, 'prozent')).toBe('−2,3 %');
    expect(fmtDelta(-0.023, 'prozent')).not.toBe('-2,3 %'); // kein ASCII-Minus
  });

  it('unter der Schwelle → ±0,0', () => {
    expect(fmtDelta(0.0001, 'prozent')).toBe('±0,0 %');
    expect(fmtDelta(-0.0004, 'prozentpunkte')).toBe('±0,0 %-Pkt.');
  });

  it('Prozentpunkte-Einheit für Rendite-Deltas', () => {
    expect(fmtDelta(0.023, 'prozentpunkte')).toBe('+2,3 %-Pkt.');
    expect(fmtDelta(-0.002, 'prozentpunkte')).toBe('−0,2 %-Pkt.');
  });

  it('eigene Schwelle überschreibt den Default', () => {
    expect(fmtDelta(0.004, 'prozent', 0.005)).toBe('±0,0 %');
  });
});
