import type { BestandInserat, PreisPunkt } from './db/bestand-repo.js';
import { tageZwischen } from './datum.js';
import { kanonischerOrt, normalisierePlz } from './normalisierung.js';
import { bruttoRendite, mean, median } from './stats.js';
import type { InseratTyp } from './types.js';

/**
 * Zeitreihen und Kennzahlen über den historisierten Bestand – pure
 * Funktionen, die Daten kommen aus bestand-repo.ts.
 */

export interface TrendPunkt {
  datum: string; // Stichtag YYYY-MM-DD
  medianKaufEurM2: number | null;
  medianMieteEurM2: number | null;
  anzahlKauf: number;
  anzahlMiete: number;
}

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

function datumPlusTage(datum: string, tage: number): string {
  return new Date(Date.parse(datum) + tage * MS_PRO_TAG).toISOString().slice(0, 10);
}

/** Map-Schlüssel eines Portal-Inserats – überall identisch bilden. */
export function inseratSchluessel(portal: string, inseratId: string): string {
  return `${portal} ${inseratId}`;
}

/** Historien-Punkte je Inserat (Schlüssel siehe inseratSchluessel), chronologisch sortiert. */
export function historieJeInserat(historie: PreisPunkt[]): Map<string, PreisPunkt[]> {
  const map = new Map<string, PreisPunkt[]>();
  for (const p of historie) {
    const schluessel = inseratSchluessel(p.portal, p.inseratId);
    const liste = map.get(schluessel);
    if (liste) liste.push(p);
    else map.set(schluessel, [p]);
  }
  for (const liste of map.values()) {
    liste.sort((a, b) => a.erfasstAm.localeCompare(b.erfasstAm));
  }
  return map;
}

/** Letzter bekannter Preis eines Inserats am Stichtag (undefined vor der ersten Zeile). */
function preisAmStichtag(punkte: PreisPunkt[] | undefined, stichtag: string): number | undefined {
  if (!punkte) return undefined;
  let preis: number | undefined;
  for (const p of punkte) {
    if (p.erfasstAm > stichtag) break;
    preis = p.preis;
  }
  return preis;
}

/**
 * Wochenraster (intervallTage) vom ersten Sehen bis bisDatum: pro Stichtag
 * der Median €/m² der dann aktiven Inserate, getrennt nach Kauf und Miete.
 * Aktiv am Stichtag D = zuerstGesehen ≤ D und zuletztGesehen ≥ D −
 * (intervallTage − 1); der Preis kommt aus der Historie (Stand D).
 */
export function berechneTrend(
  inserate: BestandInserat[],
  historie: PreisPunkt[],
  bisDatum: string,
  intervallTage = 7,
): TrendPunkt[] {
  if (inserate.length === 0) return [];
  const start = inserate.map((i) => i.zuerstGesehen).reduce((a, b) => (a < b ? a : b));
  const jeInserat = historieJeInserat(historie);

  // Raster rückwärts von bisDatum aus aufbauen, damit der letzte Punkt
  // immer der aktuelle Stand ist, dann chronologisch zurückgeben.
  const stichtage: string[] = [];
  for (let d = bisDatum; d >= start; d = datumPlusTage(d, -intervallTage)) {
    stichtage.push(d);
  }
  stichtage.reverse();

  return stichtage.map((stichtag) => {
    const eurM2: Record<InseratTyp, number[]> = { kauf: [], miete: [] };
    for (const inserat of inserate) {
      if (inserat.zuerstGesehen > stichtag) continue;
      if (tageZwischen(inserat.zuletztGesehen, stichtag) > intervallTage - 1) continue;
      const preis = preisAmStichtag(
        jeInserat.get(inseratSchluessel(inserat.portal, inserat.id)),
        stichtag,
      );
      if (preis === undefined || inserat.flaeche_m2 <= 0) continue;
      eurM2[inserat.typ].push(preis / inserat.flaeche_m2);
    }
    return {
      datum: stichtag,
      medianKaufEurM2: eurM2.kauf.length > 0 ? median(eurM2.kauf) : null,
      medianMieteEurM2: eurM2.miete.length > 0 ? median(eurM2.miete) : null,
      anzahlKauf: eurM2.kauf.length,
      anzahlMiete: eurM2.miete.length,
    };
  });
}

// --- Objekt-Zeitreihen (dedupliziert, siehe src/matching.ts) ---

/** Ein Inserat innerhalb eines Objekts, mit eigener Aktivität und Historie. */
export interface ObjektInserat {
  portal: string;
  inseratId: string;
  flaecheM2: number;
  url?: string;
  zuerstGesehen: string;
  zuletztGesehen: string;
  /** Chronologisch sortierte Preishistorie dieses Inserats. */
  historie: PreisPunkt[];
}

/**
 * Ein Objekt als Zeitreihen-Einheit: die Attribute stammen vom ältesten
 * Inserat, Aktivität ist die Vereinigung aller Inserats-Fenster. Inserate
 * ohne objekt_id (Matching noch nicht gelaufen) werden als Ein-Inserat-
 * Objekte mitgezählt.
 */
export interface ObjektZeitreihe {
  objektId?: number;
  typ: InseratTyp;
  plz: string; // normalisiert (4-stellig, soweit ableitbar)
  ort: string;
  bezirk: string;
  flaecheM2: number;
  zimmer: number;
  zuerstGesehen: string; // min über die Inserate
  zuletztGesehen: string; // max über die Inserate
  inserate: ObjektInserat[];
}

/**
 * Gruppiert den Bestand nach objekt_id zu Zeitreihen-Objekten. Verarbeitet
 * in fester Reihenfolge (zuerstGesehen, portal, id), damit die kanonischen
 * Attribute deterministisch vom ältesten Inserat stammen.
 */
export function objekteAusBestand(
  bestand: Array<BestandInserat & { objektId?: number }>,
  historie: PreisPunkt[],
): ObjektZeitreihe[] {
  const jeInserat = historieJeInserat(historie);
  const sortiert = [...bestand].sort(
    (a, b) =>
      a.zuerstGesehen.localeCompare(b.zuerstGesehen) ||
      a.portal.localeCompare(b.portal) ||
      a.id.localeCompare(b.id),
  );
  const gruppen = new Map<number | string, ObjektZeitreihe>();
  for (const i of sortiert) {
    const mitglied: ObjektInserat = {
      portal: i.portal,
      inseratId: i.id,
      flaecheM2: i.flaeche_m2,
      zuerstGesehen: i.zuerstGesehen,
      zuletztGesehen: i.zuletztGesehen,
      historie: jeInserat.get(inseratSchluessel(i.portal, i.id)) ?? [],
    };
    if (i.url !== undefined) mitglied.url = i.url;
    const schluessel = i.objektId ?? `solo ${inseratSchluessel(i.portal, i.id)}`;
    const objekt = gruppen.get(schluessel);
    if (objekt === undefined) {
      const neu: ObjektZeitreihe = {
        typ: i.typ,
        plz: normalisierePlz(i.plz, i.ort) ?? i.plz.trim(),
        ort: kanonischerOrt(i.ort),
        bezirk: i.bezirk,
        flaecheM2: i.flaeche_m2,
        zimmer: i.zimmer,
        zuerstGesehen: i.zuerstGesehen,
        zuletztGesehen: i.zuletztGesehen,
        inserate: [mitglied],
      };
      if (i.objektId !== undefined) neu.objektId = i.objektId;
      gruppen.set(schluessel, neu);
    } else {
      objekt.inserate.push(mitglied);
      if (i.zuerstGesehen < objekt.zuerstGesehen) objekt.zuerstGesehen = i.zuerstGesehen;
      if (i.zuletztGesehen > objekt.zuletztGesehen) objekt.zuletztGesehen = i.zuletztGesehen;
    }
  }
  return [...gruppen.values()];
}

/** Datenpunkt eines Objekts am Stichtag: der Minimum-Wert samt liefernden Inserat. */
export interface ObjektDatenpunkt {
  eurM2: number;
  /** Preis des Minimum-Inserats am Stichtag (aus der Historie, nicht der heutige). */
  preis: number;
  /** Das Inserat, das das Minimum liefert. */
  inserat: ObjektInserat;
  /** Am Stichtag aktive, auswertbare Inserate des Objekts (>1 = dedupliziert). */
  anzahlAktive: number;
}

/**
 * €/m² eines Objekts am Stichtag: das MINIMUM über seine dann aktiven
 * Inserate (zum niedrigeren Preis wird transaktiert; das Minimum ist zudem
 * stabil gegen die Merge-Reihenfolge). undefined, wenn kein Inserat aktiv
 * ist oder keine Fläche auswertbar.
 */
export function objektDatenpunktAmStichtag(
  objekt: ObjektZeitreihe,
  stichtag: string,
  intervallTage = 7,
): ObjektDatenpunkt | undefined {
  let minimum: ObjektDatenpunkt | undefined;
  let anzahlAktive = 0;
  for (const inserat of objekt.inserate) {
    if (inserat.zuerstGesehen > stichtag) continue;
    if (tageZwischen(inserat.zuletztGesehen, stichtag) > intervallTage - 1) continue;
    if (inserat.flaecheM2 <= 0) continue;
    const preis = preisAmStichtag(inserat.historie, stichtag);
    if (preis === undefined) continue;
    anzahlAktive += 1;
    const eurM2 = preis / inserat.flaecheM2;
    if (minimum === undefined || eurM2 < minimum.eurM2) {
      minimum = { eurM2, preis, inserat, anzahlAktive: 0 };
    }
  }
  if (minimum === undefined) return undefined;
  minimum.anzahlAktive = anzahlAktive;
  return minimum;
}

/** Wie objektDatenpunktAmStichtag, aber nur der €/m²-Wert (geht in den Median). */
export function objektEurM2AmStichtag(
  objekt: ObjektZeitreihe,
  stichtag: string,
  intervallTage = 7,
): number | undefined {
  return objektDatenpunktAmStichtag(objekt, stichtag, intervallTage)?.eurM2;
}

/**
 * Wie berechneTrend, aber über deduplizierte Objekte: ein Objekt zählt pro
 * Stichtag genau einmal, solange IRGENDEIN zugeordnetes Inserat aktiv ist
 * (delistet erst, wenn alle weg sind — Relistings halten die Reihe
 * durchgehend).
 */
export function berechneObjektTrend(
  objekte: ObjektZeitreihe[],
  bisDatum: string,
  intervallTage = 7,
): TrendPunkt[] {
  if (objekte.length === 0) return [];
  const start = objekte.map((o) => o.zuerstGesehen).reduce((a, b) => (a < b ? a : b));

  const stichtage: string[] = [];
  for (let d = bisDatum; d >= start; d = datumPlusTage(d, -intervallTage)) {
    stichtage.push(d);
  }
  stichtage.reverse();

  return stichtage.map((stichtag) => {
    const eurM2: Record<InseratTyp, number[]> = { kauf: [], miete: [] };
    for (const objekt of objekte) {
      const wert = objektEurM2AmStichtag(objekt, stichtag, intervallTage);
      if (wert !== undefined) eurM2[objekt.typ].push(wert);
    }
    return {
      datum: stichtag,
      medianKaufEurM2: eurM2.kauf.length > 0 ? median(eurM2.kauf) : null,
      medianMieteEurM2: eurM2.miete.length > 0 ? median(eurM2.miete) : null,
      anzahlKauf: eurM2.kauf.length,
      anzahlMiete: eurM2.miete.length,
    };
  });
}

/**
 * Ein einzelner Datenpunkt hinter dem Wochen-Median: ein Objekt mit dem
 * Wert, der am Stichtag in den Median eingeht, plus dem Inserat, das ihn
 * liefert (für Link und Portal-Angabe).
 */
export interface StichtagDatenpunkt {
  objektId?: number;
  ort: string;
  plz: string;
  zimmer: number;
  /** Fläche des Minimum-Inserats, damit preis/flaeche = eurM2 aufgeht. */
  flaecheM2: number;
  /** Preis am Stichtag (aus der Historie, nicht der heutige). */
  preis: number;
  eurM2: number;
  portal: string;
  inseratId: string;
  url?: string;
  /** Am Stichtag aktive Inserate des Objekts (>1 = portalübergreifend dedupliziert). */
  anzahlInserate: number;
}

/**
 * Die Datenpunkte hinter einem Wochenraster-Stichtag: pro dann aktivem
 * Objekt genau der €/m²-Wert, der in berechneObjektTrend in den Median
 * eingeht (dieselbe Kernlogik: objektDatenpunktAmStichtag). Je Serie
 * aufsteigend nach €/m² sortiert (Käufer-Perspektive: günstig zuerst).
 */
export function datenpunkteAmStichtag(
  objekte: ObjektZeitreihe[],
  stichtag: string,
  intervallTage = 7,
): { kauf: StichtagDatenpunkt[]; miete: StichtagDatenpunkt[] } {
  const punkte: Record<InseratTyp, StichtagDatenpunkt[]> = { kauf: [], miete: [] };
  for (const objekt of objekte) {
    const wert = objektDatenpunktAmStichtag(objekt, stichtag, intervallTage);
    if (wert === undefined) continue;
    const punkt: StichtagDatenpunkt = {
      ort: objekt.ort,
      plz: objekt.plz,
      zimmer: objekt.zimmer,
      flaecheM2: wert.inserat.flaecheM2,
      preis: wert.preis,
      eurM2: wert.eurM2,
      portal: wert.inserat.portal,
      inseratId: wert.inserat.inseratId,
      anzahlInserate: wert.anzahlAktive,
    };
    if (objekt.objektId !== undefined) punkt.objektId = objekt.objektId;
    if (wert.inserat.url !== undefined) punkt.url = wert.inserat.url;
    punkte[objekt.typ].push(punkt);
  }
  punkte.kauf.sort((a, b) => a.eurM2 - b.eurM2);
  punkte.miete.sort((a, b) => a.eurM2 - b.eurM2);
  return punkte;
}

/** Die €/m²-Werte aller Objekte an einem Stichtag – eine Spalte der Punktwolke. */
export interface StreuungsPunkt {
  datum: string;
  kauf: number[];
  miete: number[];
}

/**
 * Punktwolke hinter dem Wochenraster: je Stichtag die einzelnen €/m²-Werte,
 * deren Median berechneObjektTrend bildet (dieselbe Kernlogik, daher
 * deckungsgleich mit den Trend-Linien).
 */
export function streuungJeStichtag(
  objekte: ObjektZeitreihe[],
  stichtage: string[],
  intervallTage = 7,
): StreuungsPunkt[] {
  return stichtage.map((stichtag) => {
    const werte: Record<InseratTyp, number[]> = { kauf: [], miete: [] };
    for (const objekt of objekte) {
      const wert = objektEurM2AmStichtag(objekt, stichtag, intervallTage);
      if (wert !== undefined) werte[objekt.typ].push(wert);
    }
    return { datum: stichtag, kauf: werte.kauf, miete: werte.miete };
  });
}

export interface RenditeTrendPunkt {
  datum: string;
  /** Brutto-Mietrendite als Anteil (0.04 = 4 %); null, wenn eine Marktseite fehlt. */
  bruttoRendite: number | null;
}

/** Rendite-Zeitreihe aus einem Trend: Median-Miete ×12 ÷ Median-Kauf je Stichtag. */
export function berechneRenditeTrend(trend: TrendPunkt[]): RenditeTrendPunkt[] {
  return trend.map((punkt) => ({
    datum: punkt.datum,
    bruttoRendite:
      punkt.medianKaufEurM2 !== null && punkt.medianMieteEurM2 !== null
        ? bruttoRendite(punkt.medianMieteEurM2, punkt.medianKaufEurM2)
        : null,
  }));
}

export interface ObjektFilter {
  /** PLZ-Präfix: "9" = Region, "9020" = exakt. */
  plz?: string;
  flaecheMin?: number;
  flaecheMax?: number;
}

/** Der kleine Dashboard-Filter: PLZ-Präfix und m²-Bereich. */
export function filterObjekte(objekte: ObjektZeitreihe[], filter: ObjektFilter): ObjektZeitreihe[] {
  return objekte.filter((o) => {
    if (filter.plz !== undefined && !o.plz.startsWith(filter.plz)) return false;
    if (filter.flaecheMin !== undefined && o.flaecheM2 < filter.flaecheMin) return false;
    if (filter.flaecheMax !== undefined && o.flaecheM2 > filter.flaecheMax) return false;
    return true;
  });
}

export interface VermarktungsStatistik {
  anzahl: number;
  medianTage: number;
  meanTage: number;
}

/**
 * Vermarktungsdauer (zuletzt − zuerst gesehen) der delisteten Inserate je
 * Typ. Delisting ist ein Proxy für verkauft/vermietet; Inserate aus dem
 * allerersten Crawl sind links-zensiert (waren evtl. schon länger online).
 */
export function vermarktungsdauer(delisted: BestandInserat[]): {
  kauf: VermarktungsStatistik | null;
  miete: VermarktungsStatistik | null;
} {
  const statistik = (typ: InseratTyp): VermarktungsStatistik | null => {
    const tage = delisted
      .filter((i) => i.typ === typ)
      .map((i) => tageZwischen(i.zuerstGesehen, i.zuletztGesehen));
    if (tage.length === 0) return null;
    return { anzahl: tage.length, medianTage: median(tage), meanTage: mean(tage) };
  };
  return { kauf: statistik('kauf'), miete: statistik('miete') };
}

export interface RenditeKennzahl {
  /** Brutto-Mietrendite als Anteil (0.04 = 4 %). */
  brutto: number;
  medianKaufEurM2: number;
  medianMieteEurM2: number;
  /** Datenbasis der beiden Mediane – für die Einordnung an der Kachel. */
  anzahlKauf: number;
  anzahlMiete: number;
}

/**
 * Bruttorendite eines Bestands: Median-Kaltmiete ×12 ÷ Median-Kaufpreis,
 * jeweils €/m² über die übergebenen (aktiven) Inserate. null, wenn nicht
 * beide Typen mit auswertbarer Fläche vertreten sind – die Kennzahl
 * vergleicht den Miet- mit dem Kauf-Markt und braucht beide Seiten.
 */
export function berechneRendite(inserate: BestandInserat[]): RenditeKennzahl | null {
  const eurM2: Record<InseratTyp, number[]> = { kauf: [], miete: [] };
  for (const i of inserate) {
    if (i.flaeche_m2 <= 0) continue;
    eurM2[i.typ].push(i.preis / i.flaeche_m2);
  }
  if (eurM2.kauf.length === 0 || eurM2.miete.length === 0) return null;
  const medianKauf = median(eurM2.kauf);
  const medianMiete = median(eurM2.miete);
  return {
    brutto: bruttoRendite(medianMiete, medianKauf),
    medianKaufEurM2: medianKauf,
    medianMieteEurM2: medianMiete,
    anzahlKauf: eurM2.kauf.length,
    anzahlMiete: eurM2.miete.length,
  };
}

export interface LaufPreisAenderung {
  inserat: BestandInserat;
  alterPreis: number;
  neuerPreis: number;
}

/** Tages-Veränderungen eines Crawl-Laufs, siehe berechneLaufDiff. */
export interface LaufDiff {
  /** An diesem Tag zum ersten Mal gesehen. */
  neue: BestandInserat[];
  /** Bei diesem Lauf erstmals nicht mehr gesehen (leer beim ersten Lauf). */
  delistete: BestandInserat[];
  /** An diesem Tag geänderte Preise (ohne die Erst-Erfassung neuer Inserate). */
  preisAenderungen: LaufPreisAenderung[];
}

/**
 * Rekonstruiert, was ein fertiger Crawl-Lauf am Tag `laufDatum` verändert hat:
 * neu = zuerst an diesem Tag gesehen; delistet = zuletzt zwischen dem vorigen
 * fertigen Lauf (inklusive) und diesem Tag (exklusiv) gesehen; Preisänderung =
 * Historien-Punkt an diesem Tag, der nicht die Erst-Zeile des Inserats ist.
 *
 * Caveat: Der Diff ist eine Rekonstruktion aus dem heutigen Bestand. Ein
 * Inserat, das damals verschwand und später wieder auftauchte, hat ein neueres
 * zuletztGesehen und fällt rückwirkend aus der Delistet-Liste alter Läufe.
 * „Neu" und Preisänderungen sind dagegen stabil (zuerstGesehen und
 * Historien-Zeilen ändern sich nachträglich nicht).
 */
export function berechneLaufDiff(
  inserate: BestandInserat[],
  historie: PreisPunkt[],
  laufDatum: string,
  vorherigesLaufDatum: string | undefined,
): LaufDiff {
  const neue: BestandInserat[] = [];
  const delistete: BestandInserat[] = [];
  for (const i of inserate) {
    if (i.zuerstGesehen === laufDatum) neue.push(i);
    if (
      vorherigesLaufDatum !== undefined &&
      i.zuletztGesehen < laufDatum &&
      i.zuletztGesehen >= vorherigesLaufDatum
    ) {
      delistete.push(i);
    }
  }

  const jeInserat = historieJeInserat(historie);
  const preisAenderungen: LaufPreisAenderung[] = [];
  for (const i of inserate) {
    const punkte = jeInserat.get(inseratSchluessel(i.portal, i.id));
    if (!punkte) continue;
    const idx = punkte.findIndex((p) => p.erfasstAm === laufDatum);
    if (idx <= 0) continue; // kein Punkt an diesem Tag oder nur die Erst-Zeile
    const alterPreis = punkte[idx - 1]!.preis;
    const neuerPreis = punkte[idx]!.preis;
    if (alterPreis === neuerPreis) continue;
    preisAenderungen.push({ inserat: i, alterPreis, neuerPreis });
  }

  return { neue, delistete, preisAenderungen };
}

export interface PreisAenderung {
  alterPreis: number;
  neuerPreis: number;
  geaendertAm: string; // YYYY-MM-DD
}

/**
 * Letzte Preisänderung je Inserat (Schlüssel siehe inseratSchluessel),
 * Senkungen wie Erhöhungen. Inserate ohne Änderung (nur die Erst-Zeile der
 * Historie) fehlen in der Map.
 */
export function letztePreisAenderungen(historie: PreisPunkt[]): Map<string, PreisAenderung> {
  const aenderungen = new Map<string, PreisAenderung>();
  for (const [schluessel, punkte] of historieJeInserat(historie)) {
    if (punkte.length < 2) continue;
    const letzte = punkte[punkte.length - 1]!;
    const vorletzte = punkte[punkte.length - 2]!;
    aenderungen.set(schluessel, {
      alterPreis: vorletzte.preis,
      neuerPreis: letzte.preis,
      geaendertAm: letzte.erfasstAm,
    });
  }
  return aenderungen;
}
