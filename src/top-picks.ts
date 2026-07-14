import { ausreisserFlags, bruttoRendite, median, ohneAusreisser } from './stats.js';
import {
  objektDatenpunktAmStichtag,
  type ObjektDatenpunkt,
  type ObjektZeitreihe,
} from './trend.js';

/**
 * Top Picks: die aktiven Kauf-Objekte mit der höchsten geschätzten
 * Bruttorendite am Stichtag (pure Funktionen). Die Miete kommt nicht vom
 * Objekt selbst, sondern als Ausreißer-bereinigter Median-Kaltmiete-€/m²
 * seines Gebiets, mit Fallback-Kette PLZ → Bezirk → ganz Kärnten — die
 * verwendete Basis wird immer mit ausgewiesen (Ehrlichkeits-Prinzip wie
 * beim Portfolio-Vergleich).
 */

/** Unter so vielen bereinigten Miet-Werten gilt ein Gebiet nicht als belastbar. */
export const TOP_PICKS_MIN_MIET_OBJEKTE = 5;

export type MieteBasis = 'plz' | 'bezirk' | 'kaernten';

export const MIETE_BASIS_LABEL: Record<MieteBasis, string> = {
  plz: 'Miete aus PLZ',
  bezirk: 'Miete aus Bezirk',
  kaernten: 'Miete aus Kärnten',
};

export interface TopPickKandidat {
  objektId?: number;
  plz: string;
  ort: string;
  bezirk: string;
  zimmer: number;
  /** Fläche des Minimum-Inserats (kaufpreis / flaecheM2 = eurM2). */
  flaecheM2: number;
  /** Kaufpreis am Stichtag (aus der Historie, nicht der heutige). */
  kaufpreis: number;
  eurM2: number;
  medianMieteEurM2: number;
  /** Anteil (0.045 = 4,5 %). */
  bruttoRendite: number;
  mieteBasis: MieteBasis;
  portal: string;
  inseratId: string;
  url?: string;
}

interface KaufKandidat {
  objekt: ObjektZeitreihe;
  punkt: ObjektDatenpunkt;
}

function sammleIn(gruppen: Map<string, number[]>, schluessel: string, wert: number): void {
  const liste = gruppen.get(schluessel);
  if (liste === undefined) gruppen.set(schluessel, [wert]);
  else liste.push(wert);
}

/** Je Gruppe der bereinigte Median — nur wo nach der Bereinigung ≥ min Werte bleiben. */
function belastbareMediane(gruppen: Map<string, number[]>, min: number): Map<string, number> {
  const mediane = new Map<string, number>();
  for (const [schluessel, werte] of gruppen) {
    const bereinigt = ohneAusreisser(werte);
    if (bereinigt.length >= min) mediane.set(schluessel, median(bereinigt));
  }
  return mediane;
}

/**
 * Kauf-Ausreißer PLZ-lokal ausschließen: ein Objekt, das nur wegen eines
 * fragwürdigen Preises oben landen würde, ist kein Kaufsignal. Bewusst
 * nicht das globale istAusreisser-Flag der Datenpunkte — der Maßstab ist
 * die €/m²-Verteilung der eigenen PLZ (unter 4 Werten kein Ausschluss,
 * siehe ausreisserFlags).
 */
function ohneKaufAusreisser(kandidaten: KaufKandidat[]): KaufKandidat[] {
  const jePlz = new Map<string, KaufKandidat[]>();
  for (const k of kandidaten) {
    const gruppe = jePlz.get(k.objekt.plz);
    if (gruppe === undefined) jePlz.set(k.objekt.plz, [k]);
    else gruppe.push(k);
  }
  const behalten: KaufKandidat[] = [];
  for (const [plz, gruppe] of jePlz) {
    // Ohne auswertbare PLZ gibt es keine sinnvolle lokale Verteilung — die
    // ''-Gruppe wäre ein Pseudo-Gebiet quer durch Kärnten, kein Ausschluss
    // (wie die Miete-Seite, die '' aus den PLZ-Gruppen heraushält).
    if (plz === '') {
      behalten.push(...gruppe);
      continue;
    }
    const flags = ausreisserFlags(gruppe.map((k) => k.punkt.eurM2));
    for (const [i, k] of gruppe.entries()) if (!flags[i]) behalten.push(k);
  }
  return behalten;
}

function mieteBasisFuer(
  plz: string,
  bezirk: string,
  jePlz: Map<string, number>,
  jeBezirk: Map<string, number>,
  kaernten: number | undefined,
): { mieteBasis: MieteBasis; medianMieteEurM2: number } | undefined {
  const ausPlz = jePlz.get(plz);
  if (ausPlz !== undefined) return { mieteBasis: 'plz', medianMieteEurM2: ausPlz };
  const ausBezirk = jeBezirk.get(bezirk);
  if (ausBezirk !== undefined) return { mieteBasis: 'bezirk', medianMieteEurM2: ausBezirk };
  if (kaernten !== undefined) return { mieteBasis: 'kaernten', medianMieteEurM2: kaernten };
  return undefined;
}

/**
 * Deterministischer Tiebreak bei gleicher Rendite: Objekt-Ids aufsteigend
 * vor Solo-Inseraten, Solos nach (portal, inseratId) — derselbe Schlüssel,
 * mit dem objekteAusBestand Solos gruppiert, also eindeutig.
 */
function identitaetVergleich(a: TopPickKandidat, b: TopPickKandidat): number {
  if (a.objektId !== undefined && b.objektId !== undefined) return a.objektId - b.objektId;
  if (a.objektId !== undefined) return -1;
  if (b.objektId !== undefined) return 1;
  return a.portal.localeCompare(b.portal) || a.inseratId.localeCompare(b.inseratId);
}

/**
 * Die n Kauf-Objekte mit der höchsten geschätzten Bruttorendite am Stichtag.
 * `objekte` ist der komplette Kärnten-Bestand (objekteAusBestand), NICHT
 * vorgefiltert: der PLZ-Filter grenzt nur die Kauf-Kandidaten ein, die
 * Miet-Mediane brauchen alle Miet-Objekte, sonst greift die Kaskade auf
 * zu wenig Daten zu.
 */
export function topPicks(
  objekte: ObjektZeitreihe[],
  stichtag: string,
  plzFilter: string | undefined,
  n = 10,
  minMietObjekte = TOP_PICKS_MIN_MIET_OBJEKTE,
): TopPickKandidat[] {
  const mietenJePlz = new Map<string, number[]>();
  const mietenJeBezirk = new Map<string, number[]>();
  const mietenKaernten: number[] = [];
  const kaufKandidaten: KaufKandidat[] = [];

  for (const objekt of objekte) {
    const punkt = objektDatenpunktAmStichtag(objekt, stichtag);
    if (punkt === undefined || punkt.eurM2 <= 0) continue;
    if (objekt.typ === 'miete') {
      if (objekt.plz !== '') sammleIn(mietenJePlz, objekt.plz, punkt.eurM2);
      if (objekt.bezirk !== '') sammleIn(mietenJeBezirk, objekt.bezirk, punkt.eurM2);
      mietenKaernten.push(punkt.eurM2);
    } else if (plzFilter === undefined || plzFilter === '' || objekt.plz.startsWith(plzFilter)) {
      // Schon hier filtern ist äquivalent zur Prüfung nach dem Ausreißer-
      // Ausschluss (der Präfix-Filter zerschneidet exakte PLZ-Gruppen nie)
      // und spart die IQR-Rechnung für ausgefilterte Gebiete.
      kaufKandidaten.push({ objekt, punkt });
    }
  }

  const medianJePlz = belastbareMediane(mietenJePlz, minMietObjekte);
  const medianJeBezirk = belastbareMediane(mietenJeBezirk, minMietObjekte);
  const kaerntenBereinigt = ohneAusreisser(mietenKaernten);
  const medianKaernten =
    kaerntenBereinigt.length >= minMietObjekte ? median(kaerntenBereinigt) : undefined;

  const picks: TopPickKandidat[] = [];
  for (const { objekt, punkt } of ohneKaufAusreisser(kaufKandidaten)) {
    const basis = mieteBasisFuer(
      objekt.plz,
      objekt.bezirk,
      medianJePlz,
      medianJeBezirk,
      medianKaernten,
    );
    if (basis === undefined) continue;
    const pick: TopPickKandidat = {
      plz: objekt.plz,
      ort: objekt.ort,
      bezirk: objekt.bezirk,
      zimmer: objekt.zimmer,
      flaecheM2: punkt.inserat.flaecheM2,
      kaufpreis: punkt.preis,
      eurM2: punkt.eurM2,
      medianMieteEurM2: basis.medianMieteEurM2,
      bruttoRendite: bruttoRendite(basis.medianMieteEurM2, punkt.eurM2),
      mieteBasis: basis.mieteBasis,
      portal: punkt.inserat.portal,
      inseratId: punkt.inserat.inseratId,
    };
    if (objekt.objektId !== undefined) pick.objektId = objekt.objektId;
    if (punkt.inserat.url !== undefined) pick.url = punkt.inserat.url;
    picks.push(pick);
  }

  picks.sort((a, b) => b.bruttoRendite - a.bruttoRendite || identitaetVergleich(a, b));
  return picks.slice(0, n);
}
