import type { Inserat } from './types.js';

/**
 * Harte Plausibilitätsregeln VOR der Statistik: feste Kärnten-einheitliche
 * Grenzen für Wohnungs-Inserate. Sie fangen strukturell falsche Portal-Felder
 * (z. B. Grundstücks- statt Wohnfläche), bei denen die 1,5×IQR-Statistik
 * kippt, sobald mehrere Fehler auf einmal hereinkommen. Der Befund wird als
 * datenqualitaet-Spalte am Bestand persistiert (Migration 007) — ein Flag,
 * keine Bereinigung: gelöscht wird nie.
 */

export const PLAUSIBILITAET_GRENZEN = {
  flaecheM2: { min: 15, max: 500 },
  eurM2Kauf: { min: 500, max: 20000 },
  eurM2Miete: { min: 3, max: 50 },
  zimmerRatio: { min: 8, max: 80 }, // m²/Zimmer
  preisKauf: { min: 20_000, max: 1_000_000 },
  preisMiete: { min: 100, max: 10_000 }, // Kaltmiete/Monat
} as const;

export type AusreisserGrund =
  | 'flaeche_ausreisser'
  | 'eurm2_kauf_ausreisser'
  | 'eurm2_miete_ausreisser'
  | 'zimmer_ratio_ausreisser'
  | 'preis_kauf_ausreisser'
  | 'preis_miete_ausreisser';

export const AUSREISSER_GRUND_LABEL: Record<AusreisserGrund, string> = {
  flaeche_ausreisser: 'Fläche unplausibel',
  eurm2_kauf_ausreisser: '€/m² (Kauf) unplausibel',
  eurm2_miete_ausreisser: '€/m² (Miete) unplausibel',
  zimmer_ratio_ausreisser: 'Fläche pro Zimmer unplausibel',
  preis_kauf_ausreisser: 'Kaufpreis unplausibel',
  preis_miete_ausreisser: 'Miete unplausibel',
};

/** Reihenfolge der Gründe im Komma-String — deterministisch, wie im Union-Type. */
const GRUND_REIHENFOLGE: readonly AusreisserGrund[] = [
  'flaeche_ausreisser',
  'eurm2_kauf_ausreisser',
  'eurm2_miete_ausreisser',
  'zimmer_ratio_ausreisser',
  'preis_kauf_ausreisser',
  'preis_miete_ausreisser',
];

/**
 * Vereinigt mehrere datenqualitaet-Strings (z. B. der Inserate eines Objekts):
 * dedupliziert, bekannte Gründe in kanonischer Reihenfolge, unbekannte Tokens
 * hinten angehängt. undefined, wenn nichts geflaggt ist.
 */
export function vereinigeDatenqualitaet(werte: Iterable<string>): string | undefined {
  const tokens = new Set<string>();
  for (const wert of werte) {
    for (const token of wert.split(',')) tokens.add(token);
  }
  if (tokens.size === 0) return undefined;
  const bekannt = GRUND_REIHENFOLGE.filter((g) => tokens.delete(g));
  return [...bekannt, ...tokens].join(',');
}

type Grenze = { readonly min: number; readonly max: number };

/** Plausibel = min ≤ wert ≤ max (Grenzen inklusiv). */
function ausserhalb(wert: number, grenze: Grenze): boolean {
  return wert < grenze.min || wert > grenze.max;
}

/**
 * Menschenlesbare Labels eines datenqualitaet-Werts, „ · "-verbunden.
 * Unbekannte Tokens (z. B. aus einer neueren Regel-Version) erscheinen roh,
 * statt still zu verschwinden.
 */
export function datenqualitaetLabels(datenqualitaet: string): string {
  return datenqualitaet
    .split(',')
    .map((grund) => AUSREISSER_GRUND_LABEL[grund as AusreisserGrund] ?? grund)
    .join(' · ');
}

/**
 * Reine Funktion, keine DB-Abhängigkeit. Bekommt ein Bestand-Inserat (nach
 * Extraktion aus dem Portal-JSON), liefert den Komma-String der Gründe oder
 * null (= plausibel). Grenzen sind Kärnten-einheitlich; €/m² wird nur bei
 * plausibler Fläche geprüft (sonst wäre derselbe Feld-Fehler doppelt gezählt),
 * die Zimmer-Ratio nur bei zimmer > 0 (keine Division durch null).
 */
export function pruefePlausibilitaet(
  inserat: Pick<Inserat, 'typ' | 'preis' | 'flaeche_m2' | 'zimmer'>,
  grenzen = PLAUSIBILITAET_GRENZEN,
): string | null {
  const gruende = new Set<AusreisserGrund>();

  const flaechePlausibel = !ausserhalb(inserat.flaeche_m2, grenzen.flaecheM2);
  if (!flaechePlausibel) gruende.add('flaeche_ausreisser');

  if (flaechePlausibel && inserat.flaeche_m2 > 0) {
    const eurM2 = inserat.preis / inserat.flaeche_m2;
    const grenze = inserat.typ === 'kauf' ? grenzen.eurM2Kauf : grenzen.eurM2Miete;
    if (ausserhalb(eurM2, grenze)) {
      gruende.add(inserat.typ === 'kauf' ? 'eurm2_kauf_ausreisser' : 'eurm2_miete_ausreisser');
    }
  }

  if (inserat.zimmer > 0 && ausserhalb(inserat.flaeche_m2 / inserat.zimmer, grenzen.zimmerRatio)) {
    gruende.add('zimmer_ratio_ausreisser');
  }

  const preisGrenze = inserat.typ === 'kauf' ? grenzen.preisKauf : grenzen.preisMiete;
  if (ausserhalb(inserat.preis, preisGrenze)) {
    gruende.add(inserat.typ === 'kauf' ? 'preis_kauf_ausreisser' : 'preis_miete_ausreisser');
  }

  if (gruende.size === 0) return null;
  return GRUND_REIHENFOLGE.filter((g) => gruende.has(g)).join(',');
}
