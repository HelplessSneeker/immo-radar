/** Statistik-Grundfunktionen. Alle Funktionen werfen bei leerem Input. */

function assertNichtLeer(werte: number[], fn: string): void {
  if (werte.length === 0) throw new Error(`${fn}: leere Eingabe.`);
}

export function mean(werte: number[]): number {
  assertNichtLeer(werte, 'mean');
  return werte.reduce((a, b) => a + b, 0) / werte.length;
}

export function median(werte: number[]): number {
  assertNichtLeer(werte, 'median');
  const s = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mitte]! : (s[mitte - 1]! + s[mitte]!) / 2;
}

/**
 * Quantil mit linearer Interpolation (R-7, Standard in NumPy/Excel):
 * Position = (n − 1) · p.
 */
export function quantile(werte: number[], p: number): number {
  assertNichtLeer(werte, 'quantile');
  if (p < 0 || p > 1) throw new Error(`quantile: p muss in [0, 1] liegen, ist ${p}.`);
  const s = [...werte].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export interface IqrGrenzen {
  q1: number;
  q3: number;
  untere: number;
  obere: number;
}

/** 1,5×IQR-Grenzen: Werte außerhalb [Q1 − 1,5·IQR, Q3 + 1,5·IQR] gelten als Ausreißer. */
export function iqrGrenzen(werte: number[]): IqrGrenzen {
  const q1 = quantile(werte, 0.25);
  const q3 = quantile(werte, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, untere: q1 - 1.5 * iqr, obere: q3 + 1.5 * iqr };
}

/** Flag je Wert (positionsgleich zur Eingabe): true = Ausreißer nach 1,5×IQR. */
export function ausreisserFlags(werte: number[]): boolean[] {
  if (werte.length < 4) return werte.map(() => false); // IQR ist unter 4 Werten nicht belastbar
  const { untere, obere } = iqrGrenzen(werte);
  return werte.map((w) => w < untere || w > obere);
}

/**
 * Brutto-Mietrendite = (Median-Kaltmiete €/m² × 12) / Median-Kaufpreis €/m².
 * Ergebnis als Anteil (0.04 = 4 %).
 */
export function bruttoRendite(medianMieteEurM2: number, medianKaufEurM2: number): number {
  if (medianKaufEurM2 <= 0) throw new Error('bruttoRendite: Kaufpreis muss positiv sein.');
  return (medianMieteEurM2 * 12) / medianKaufEurM2;
}
