import type { Inserat, InseratTyp } from './types.js';

/** Bundesland-Slug (URL-Pfad beider Portale) → Anzeigename. */
export const BUNDESLAENDER: Record<string, string> = {
  burgenland: 'Burgenland',
  kaernten: 'Kärnten',
  niederoesterreich: 'Niederösterreich',
  oberoesterreich: 'Oberösterreich',
  salzburg: 'Salzburg',
  steiermark: 'Steiermark',
  tirol: 'Tirol',
  vorarlberg: 'Vorarlberg',
  wien: 'Wien',
};

/** Ungültige Sucheingaben – der Server antwortet damit als 400. */
export class SuchKriterienFehler extends Error {}

export type SuchTyp = InseratTyp | 'beide';

export interface SuchKriterien {
  /** Bundesland-Slug, siehe BUNDESLAENDER. */
  bundesland: string;
  typ: SuchTyp;
  /** Bei typ=miete Monatsmiete, sonst Kaufpreis (in €). */
  preisMin?: number;
  preisMax?: number;
  flaecheMin?: number;
  flaecheMax?: number;
  zimmerMin?: number;
  zimmerMax?: number;
  /** Freitext, matcht Ort, PLZ oder Bezirk (Teilstring, case-insensitiv). */
  ort?: string;
}

function zahlOderUndefined(params: URLSearchParams, name: string): number | undefined {
  const roh = params.get(name)?.trim();
  if (!roh) return undefined;
  const n = Number(roh.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw new SuchKriterienFehler(`"${name}" muss eine positive Zahl sein, ist "${roh}".`);
  }
  return n;
}

function pruefeBereich(name: string, min?: number, max?: number): void {
  if (min !== undefined && max !== undefined && min > max) {
    throw new SuchKriterienFehler(`${name}: "von" (${min}) darf nicht größer als "bis" (${max}) sein.`);
  }
}

/** Validiert die Query-Parameter der Suchseite zu SuchKriterien. */
export function parseSuchKriterien(params: URLSearchParams): SuchKriterien {
  const bundesland = params.get('bundesland')?.trim().toLowerCase() ?? '';
  if (!(bundesland in BUNDESLAENDER)) {
    throw new SuchKriterienFehler(
      `Unbekanntes Bundesland "${bundesland}". Erlaubt: ${Object.keys(BUNDESLAENDER).join(', ')}`,
    );
  }

  const typRoh = params.get('typ')?.trim().toLowerCase() || 'beide';
  if (typRoh !== 'kauf' && typRoh !== 'miete' && typRoh !== 'beide') {
    throw new SuchKriterienFehler(`"typ" muss kauf, miete oder beide sein, ist "${typRoh}".`);
  }

  const kriterien: SuchKriterien = {
    bundesland,
    typ: typRoh,
    preisMin: zahlOderUndefined(params, 'preis_min'),
    preisMax: zahlOderUndefined(params, 'preis_max'),
    flaecheMin: zahlOderUndefined(params, 'flaeche_min'),
    flaecheMax: zahlOderUndefined(params, 'flaeche_max'),
    zimmerMin: zahlOderUndefined(params, 'zimmer_min'),
    zimmerMax: zahlOderUndefined(params, 'zimmer_max'),
  };
  pruefeBereich('Preis', kriterien.preisMin, kriterien.preisMax);
  pruefeBereich('Fläche', kriterien.flaecheMin, kriterien.flaecheMax);
  pruefeBereich('Zimmer', kriterien.zimmerMin, kriterien.zimmerMax);

  const ort = params.get('ort')?.trim();
  if (ort) kriterien.ort = ort;
  return kriterien;
}

/**
 * Serverseitiger Filter über die gecrawlten Inserate. Der Preis wird nur auf
 * den Typ angewendet, auf den er sich bezieht (bei "beide" der Kauf) – die
 * willhaben-URL filtert ihn zwar schon, aber wir verlassen uns nicht darauf.
 */
export function filterInserate(inserate: Inserat[], kriterien: SuchKriterien): Inserat[] {
  const preisTyp: InseratTyp = kriterien.typ === 'beide' ? 'kauf' : kriterien.typ;
  const ort = kriterien.ort?.toLowerCase();

  return inserate.filter((i) => {
    if (i.typ === preisTyp) {
      if (kriterien.preisMin !== undefined && i.preis < kriterien.preisMin) return false;
      if (kriterien.preisMax !== undefined && i.preis > kriterien.preisMax) return false;
    }
    if (kriterien.flaecheMin !== undefined && i.flaeche_m2 < kriterien.flaecheMin) return false;
    if (kriterien.flaecheMax !== undefined && i.flaeche_m2 > kriterien.flaecheMax) return false;
    if (kriterien.zimmerMin !== undefined && i.zimmer < kriterien.zimmerMin) return false;
    if (kriterien.zimmerMax !== undefined && i.zimmer > kriterien.zimmerMax) return false;
    if (
      ort &&
      !i.ort.toLowerCase().includes(ort) &&
      !i.plz.toLowerCase().includes(ort) &&
      !i.bezirk.toLowerCase().includes(ort)
    ) {
      return false;
    }
    return true;
  });
}
