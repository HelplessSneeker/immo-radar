import { describe, expect, it } from 'vitest';
import { kanonischerOrt, normalisierePlz } from '../src/normalisierung.js';

describe('normalisierePlz', () => {
  it('zieht die erste 4-stellige PLZ aus dem PLZ-Feld', () => {
    expect(normalisierePlz('9020')).toBe('9020');
    expect(normalisierePlz(' 9020 ')).toBe('9020');
    expect(normalisierePlz('9020 Klagenfurt')).toBe('9020');
    expect(normalisierePlz('A-9020')).toBe('9020');
  });

  it('fällt auf den Ort zurück, wenn das PLZ-Feld nichts hergibt', () => {
    expect(normalisierePlz('', '9500 Villach')).toBe('9500');
    expect(normalisierePlz('unbekannt', 'Villach')).toBeUndefined();
    expect(normalisierePlz('')).toBeUndefined();
  });

  it('greift keine 5-stelligen Zahlen (z. B. Preise) ab', () => {
    expect(normalisierePlz('123456')).toBeUndefined();
    expect(normalisierePlz('12345', '9020')).toBe('9020');
  });
});

describe('kanonischerOrt', () => {
  it('kollabiert Whitespace und streift eine führende PLZ ab', () => {
    expect(kanonischerOrt('Klagenfurt')).toBe('Klagenfurt');
    expect(kanonischerOrt('  9020   Klagenfurt ')).toBe('Klagenfurt');
    expect(kanonischerOrt('Sankt  Veit an der   Glan')).toBe('Sankt Veit an der Glan');
  });

  it('lässt den Ort stehen, wenn nach der PLZ nichts übrig bliebe', () => {
    expect(kanonischerOrt('9020')).toBe('9020');
  });
});
