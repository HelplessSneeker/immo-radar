import { describe, expect, it } from 'vitest';
import {
  AUSREISSER_GRUND_LABEL,
  datenqualitaetLabels,
  PLAUSIBILITAET_GRENZEN,
  pruefePlausibilitaet,
  vereinigeDatenqualitaet,
} from '../src/plausibilitaet.js';
import type { Inserat } from '../src/types.js';

type PruefInserat = Pick<Inserat, 'typ' | 'preis' | 'flaeche_m2' | 'zimmer'>;

/** Plausibles Kauf-Inserat: 80 m², 3 Zimmer, 3.000 €/m². */
function kauf(overrides: Partial<PruefInserat> = {}): PruefInserat {
  return { typ: 'kauf', preis: 240_000, flaeche_m2: 80, zimmer: 3, ...overrides };
}

/** Plausibles Miet-Inserat: 80 m², 3 Zimmer, 10 €/m² Kaltmiete. */
function miete(overrides: Partial<PruefInserat> = {}): PruefInserat {
  return { typ: 'miete', preis: 800, flaeche_m2: 80, zimmer: 3, ...overrides };
}

describe('pruefePlausibilitaet', () => {
  it('liefert null für plausible Kauf- und Miet-Inserate', () => {
    expect(pruefePlausibilitaet(kauf())).toBeNull();
    expect(pruefePlausibilitaet(miete())).toBeNull();
  });

  it('flaggt zu große und zu kleine Flächen', () => {
    // Preis mitskalieren, damit nur die Fläche unplausibel ist.
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 501, zimmer: 10, preis: 900_000 }))).toBe(
      'flaeche_ausreisser',
    );
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 14, zimmer: 1, preis: 70_000 }))).toBe(
      'flaeche_ausreisser',
    );
  });

  it('behandelt die Grenzen inklusiv: exakt min und max sind plausibel', () => {
    const { flaecheM2, eurM2Kauf, zimmerRatio, preisKauf, preisMiete, eurM2Miete } =
      PLAUSIBILITAET_GRENZEN;
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: flaecheM2.min, zimmer: 1, preis: 60_000 }))).toBeNull();
    expect(
      pruefePlausibilitaet(kauf({ flaeche_m2: flaecheM2.max, zimmer: 10, preis: 900_000 })),
    ).toBeNull();
    // €/m² exakt an der Grenze: 100 m² × 500 €/m² bzw. × 20.000 €/m² wäre
    // preislich außerhalb, deshalb 50 m².
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 50, zimmer: 2, preis: 50 * eurM2Kauf.min }))).toBeNull();
    expect(
      pruefePlausibilitaet(kauf({ flaeche_m2: 50, zimmer: 2, preis: 50 * eurM2Kauf.max })),
    ).toBeNull();
    expect(pruefePlausibilitaet(miete({ flaeche_m2: 50, zimmer: 2, preis: 50 * eurM2Miete.min }))).toBeNull();
    expect(pruefePlausibilitaet(kauf({ zimmer: 80 / zimmerRatio.min }))).toBeNull();
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 80, zimmer: 1 }))).toBeNull(); // Ratio exakt 80 = max
    expect(pruefePlausibilitaet(kauf({ preis: preisKauf.min, flaeche_m2: 40 }))).toBeNull();
    expect(pruefePlausibilitaet(kauf({ preis: preisKauf.max, flaeche_m2: 100, zimmer: 4 }))).toBeNull();
    expect(pruefePlausibilitaet(miete({ preis: preisMiete.min, flaeche_m2: 30, zimmer: 1 }))).toBeNull();
  });

  it('prüft €/m² typ-abhängig: 60 €/m² ist als Miete unplausibel, als Kauf auch (zu billig)', () => {
    // 100 m² × 60 €/m²: über der Miet-Grenze (50) …
    expect(pruefePlausibilitaet(miete({ flaeche_m2: 100, preis: 6_000 }))).toBe(
      'eurm2_miete_ausreisser',
    );
    // … und unter der Kauf-Grenze (500) — aber dort schlägt zusätzlich der absolute Preis an.
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 100, zimmer: 4, preis: 6_000 }))).toBe(
      'eurm2_kauf_ausreisser,preis_kauf_ausreisser',
    );
  });

  it('flaggt zu hohes und zu niedriges €/m² (Kauf)', () => {
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 40, zimmer: 2, preis: 900_000 }))).toBe(
      'eurm2_kauf_ausreisser',
    );
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 100, zimmer: 4, preis: 40_000 }))).toBe(
      'eurm2_kauf_ausreisser',
    );
  });

  it('prüft €/m² nicht, wenn die Fläche schon unplausibel ist', () => {
    // 9758 m² „Wohnfläche" (eigentlich Grundstück): eurM2 wäre 23,6 — kein
    // zusätzliches eurm2-Flag, der Feld-Fehler zählt nur einmal.
    const ergebnis = pruefePlausibilitaet(kauf({ flaeche_m2: 9758, preis: 230_000 }));
    expect(ergebnis).toBe('flaeche_ausreisser,zimmer_ratio_ausreisser');
  });

  it('flaggt unplausible Zimmer-Ratios in beide Richtungen', () => {
    // 80 m² / 12 Zimmer = 6,7 m²/Zimmer < 8
    expect(pruefePlausibilitaet(kauf({ zimmer: 12 }))).toBe('zimmer_ratio_ausreisser');
    // 400 m² / 4 Zimmer = 100 m²/Zimmer > 80
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 400, zimmer: 4, preis: 900_000 }))).toBe(
      'zimmer_ratio_ausreisser',
    );
  });

  it('skippt die Zimmer-Ratio bei zimmer = 0', () => {
    expect(pruefePlausibilitaet(kauf({ zimmer: 0 }))).toBeNull();
  });

  it('flaggt absolute Preise typ-abhängig', () => {
    expect(pruefePlausibilitaet(kauf({ preis: 2_000_000 }))).toBe(
      'eurm2_kauf_ausreisser,preis_kauf_ausreisser',
    );
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 30, zimmer: 1, preis: 19_999 }))).toBe(
      'preis_kauf_ausreisser',
    );
    expect(pruefePlausibilitaet(miete({ preis: 10_001, flaeche_m2: 150, zimmer: 5 }))).toBe(
      'eurm2_miete_ausreisser,preis_miete_ausreisser',
    );
    expect(pruefePlausibilitaet(miete({ preis: 99, flaeche_m2: 20, zimmer: 1 }))).toBe(
      'preis_miete_ausreisser',
    );
  });

  it('kombiniert mehrere Gründe komma-separiert in fester Reihenfolge', () => {
    // Fläche unplausibel + Ratio unplausibel + Kaufpreis unplausibel.
    expect(pruefePlausibilitaet(kauf({ flaeche_m2: 9758, zimmer: 3, preis: 5_000_000 }))).toBe(
      'flaeche_ausreisser,zimmer_ratio_ausreisser,preis_kauf_ausreisser',
    );
  });
});

describe('vereinigeDatenqualitaet', () => {
  it('dedupliziert und ordnet kanonisch, unabhängig von der Eingabe-Reihenfolge', () => {
    expect(
      vereinigeDatenqualitaet([
        'zimmer_ratio_ausreisser,flaeche_ausreisser',
        'flaeche_ausreisser,preis_kauf_ausreisser',
      ]),
    ).toBe('flaeche_ausreisser,zimmer_ratio_ausreisser,preis_kauf_ausreisser');
  });

  it('leere Eingabe ⇒ undefined; unbekannte Tokens bleiben erhalten (hinten)', () => {
    expect(vereinigeDatenqualitaet([])).toBeUndefined();
    expect(vereinigeDatenqualitaet(['neues_flag,flaeche_ausreisser'])).toBe(
      'flaeche_ausreisser,neues_flag',
    );
  });
});

describe('datenqualitaetLabels', () => {
  it('übersetzt Gründe und verbindet mehrere mit „ · "', () => {
    expect(datenqualitaetLabels('flaeche_ausreisser')).toBe('Fläche unplausibel');
    expect(datenqualitaetLabels('flaeche_ausreisser,zimmer_ratio_ausreisser')).toBe(
      'Fläche unplausibel · Fläche pro Zimmer unplausibel',
    );
  });

  it('zeigt unbekannte Tokens roh statt sie zu verschlucken', () => {
    expect(datenqualitaetLabels('neues_flag')).toBe('neues_flag');
  });

  it('hat für jeden Grund ein Label', () => {
    for (const label of Object.values(AUSREISSER_GRUND_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
