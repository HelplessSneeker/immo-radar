import type { PortfolioObjekt } from './db/portfolio-repo.js';
import { normalisierePlz } from './normalisierung.js';
import { bruttoRendite, median } from './stats.js';
import { objektEurM2AmStichtag, type ObjektZeitreihe } from './trend.js';

/**
 * Marktvergleich eines Portfolio-Objekts gegen die deduplizierten
 * Markt-Objekte (pure Funktionen). Fallback-Kette je Kennzahl:
 * PLZ → Bezirk (per Mehrheits-Zuordnung der PLZ) → ganz Kärnten — die
 * verwendete Ebene wird immer mit ausgewiesen (Ehrlichkeits-Prinzip: ein
 * Kärnten-weiter Vergleich ist etwas anderes als einer in derselben PLZ).
 */

/** Unter so vielen Vergleichsobjekten steigt die Kette zur nächsten Ebene auf. */
export const MIN_VERGLEICHSOBJEKTE = 5;

export type VergleichsEbene = 'plz' | 'bezirk' | 'land';

export const EBENEN_LABEL: Record<VergleichsEbene, string> = {
  plz: 'gleiche PLZ',
  bezirk: 'gleicher Bezirk',
  land: 'ganz Kärnten',
};

export interface MieteVergleich {
  ebene: VergleichsEbene;
  /** Median-Kaltmiete €/m² der aktiven Miet-Objekte der Ebene. */
  marktMieteM2: number;
  anzahl: number;
}

export interface RenditeVergleich {
  ebene: VergleichsEbene;
  /** Markt-Bruttorendite der Ebene (Median Miete ×12 ÷ Median Kauf, je €/m²). */
  marktRendite: number;
  anzahlKauf: number;
  anzahlMiete: number;
}

export interface PortfolioVergleich {
  /** Eigene Kaltmiete €/m²; undefined = leerstehend. */
  eigeneMieteM2?: number;
  /** Eigene Ist-Rendite (Miete ×12 ÷ Kaufpreis); undefined = leerstehend. */
  eigeneRendite?: number;
  miete?: MieteVergleich;
  rendite?: RenditeVergleich;
  /**
   * Monatliches Miet-Potenzial: (Markt-Median − eigene Miete) × Fläche.
   * Nur gesetzt, wenn die eigene Miete unter Markt liegt (positiv).
   */
  mietPotenzialMonat?: number;
}

interface AktiveWerte {
  objekt: ObjektZeitreihe;
  eurM2: number;
}

/** Bezirk einer PLZ per Mehrheits-Votum der Markt-Objekte dieser PLZ. */
function bezirkZuPlz(marktObjekte: ObjektZeitreihe[], plz: string): string | undefined {
  const zaehler = new Map<string, number>();
  for (const o of marktObjekte) {
    if (o.plz !== plz || !o.bezirk) continue;
    zaehler.set(o.bezirk, (zaehler.get(o.bezirk) ?? 0) + 1);
  }
  let bester: string | undefined;
  let maximum = 0;
  for (const [bezirk, anzahl] of zaehler) {
    if (anzahl > maximum) {
      maximum = anzahl;
      bester = bezirk;
    }
  }
  return bester;
}

function ebenenFilter(
  ebene: VergleichsEbene,
  plz: string,
  bezirk: string | undefined,
): (o: ObjektZeitreihe) => boolean {
  if (ebene === 'plz') return (o) => o.plz === plz;
  if (ebene === 'bezirk') return (o) => o.bezirk === bezirk;
  return () => true;
}

/**
 * Vergleicht ein Portfolio-Objekt gegen die am Stichtag aktiven
 * Markt-Objekte. `marktObjekte` ist der komplette Kärnten-Bestand
 * (objekteAusBestand) — die Ebenen-Filter laufen hier.
 */
export function vergleichePortfolio(
  objekt: PortfolioObjekt,
  marktObjekte: ObjektZeitreihe[],
  stichtag: string,
): PortfolioVergleich {
  const vergleich: PortfolioVergleich = {};
  if (objekt.mieteMonat !== undefined && objekt.flaecheM2 > 0) {
    vergleich.eigeneMieteM2 = objekt.mieteMonat / objekt.flaecheM2;
    vergleich.eigeneRendite = (objekt.mieteMonat * 12) / objekt.kaufpreis;
  }

  const plz = normalisierePlz(objekt.plz, objekt.ort) ?? objekt.plz.trim();
  const bezirk = bezirkZuPlz(marktObjekte, plz);

  // Aktive Marktwerte einmal berechnen, dann je Ebene filtern.
  const aktive: AktiveWerte[] = [];
  for (const markt of marktObjekte) {
    const eurM2 = objektEurM2AmStichtag(markt, stichtag);
    if (eurM2 !== undefined) aktive.push({ objekt: markt, eurM2 });
  }

  const ebenen: VergleichsEbene[] = ['plz', 'bezirk', 'land'];
  for (const ebene of ebenen) {
    if (ebene === 'bezirk' && bezirk === undefined) continue;
    const passend = aktive.filter((a) => ebenenFilter(ebene, plz, bezirk)(a.objekt));
    const mieten = passend.filter((a) => a.objekt.typ === 'miete').map((a) => a.eurM2);
    const kaeufe = passend.filter((a) => a.objekt.typ === 'kauf').map((a) => a.eurM2);

    if (vergleich.miete === undefined && mieten.length >= MIN_VERGLEICHSOBJEKTE) {
      vergleich.miete = { ebene, marktMieteM2: median(mieten), anzahl: mieten.length };
    }
    if (
      vergleich.rendite === undefined &&
      mieten.length >= MIN_VERGLEICHSOBJEKTE &&
      kaeufe.length >= MIN_VERGLEICHSOBJEKTE
    ) {
      vergleich.rendite = {
        ebene,
        marktRendite: bruttoRendite(median(mieten), median(kaeufe)),
        anzahlKauf: kaeufe.length,
        anzahlMiete: mieten.length,
      };
    }
    if (vergleich.miete !== undefined && vergleich.rendite !== undefined) break;
  }

  if (
    vergleich.eigeneMieteM2 !== undefined &&
    vergleich.miete !== undefined &&
    vergleich.miete.marktMieteM2 > vergleich.eigeneMieteM2
  ) {
    vergleich.mietPotenzialMonat =
      (vergleich.miete.marktMieteM2 - vergleich.eigeneMieteM2) * objekt.flaecheM2;
  }

  return vergleich;
}
