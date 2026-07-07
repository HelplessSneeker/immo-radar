import type { BestandInserat } from './db/bestand-repo.js';
import { tageZwischen } from './datum.js';
import { kanonischerOrt, normalisierePlz } from './normalisierung.js';

/**
 * Objekt-Matching (Dedup): fasst Portal-Inserate, die auf dieselbe Wohnung
 * zeigen, zu einem "Objekt" zusammen. Pure Funktionen, deterministisch —
 * dieselbe Eingabe ergibt dieselbe Partition; die Persistenz übernimmt
 * objekte-repo.ts.
 *
 * Zwei Regeln:
 * - "duplikat": zeitlich überlappende Inserate auf VERSCHIEDENEN Portalen
 *   (dasselbe Portal dedupliziert sich selbst; gleichzeitig aktive Inserate
 *   eines Portals sind echte verschiedene Einheiten — der Hauptschutz gegen
 *   Neubauprojekte mit identischen Wohnungen).
 * - "relisting": zeitlich disjunkte Inserate (Lücke ≤ 60 Tage) — dieselbe
 *   Wohnung, neu eingestellt; die Historie läuft weiter, die
 *   Vermarktungsdauer beginnt nicht von vorn.
 *
 * Gemeinsame Attribut-Schwellen: gleiche (normalisierte) PLZ, |ΔFläche|
 * ≤ 1 m², Zimmer exakt, Baujahr-Guard (beide gesetzt und |Δ| > 2 ⇒ kein
 * Match). Preistoleranz: duplikat Kauf ≤ 2,5 %, Miete ≤ 3 % oder ≤ 25 €;
 * relisting ± 10 % (Wiedereinstellungen ändern oft den Preis).
 */

export const FLAECHE_TOLERANZ_M2 = 1.0;
export const KAUF_PREIS_TOLERANZ = 0.025;
export const MIETE_PREIS_TOLERANZ = 0.03;
export const MIETE_PREIS_TOLERANZ_EUR = 25;
export const RELISTING_PREIS_TOLERANZ = 0.1;
export const RELISTING_MAX_LUECKE_TAGE = 60;
export const BAUJAHR_TOLERANZ = 2;

export type ZuordnungsRegel = 'neu' | 'duplikat' | 'relisting';

/** Ein Bestand-Inserat mit ggf. schon persistierter Objekt-Zuordnung. */
export interface MatchInserat extends BestandInserat {
  objektId?: number;
}

/** Kanonische Objekt-Attribute — vom ältesten zugeordneten Inserat. */
export interface ObjektKanon {
  typ: 'kauf' | 'miete';
  plz: string;
  ort: string;
  bezirk: string;
  flaecheM2: number;
  zimmer: number;
  baujahr?: number;
}

export interface ObjektMitglied {
  inserat: MatchInserat;
  /** Regel, über die das Mitglied in die Gruppe kam; 'bestehend' = schon in der DB zugeordnet. */
  regel: ZuordnungsRegel | 'bestehend';
  /** Deltas fürs Audit-Log (nur bei neuen Zuordnungen). */
  details?: { deltaFlaecheM2: number; deltaPreisProzent: number };
}

export interface ObjektGruppe {
  /** DB-Objekt-ID, wenn die Gruppe aus bestehenden Zuordnungen stammt. */
  objektId?: number;
  kanon: ObjektKanon;
  mitglieder: ObjektMitglied[];
}

/** [zuerst, zuletzt]-Fenster zweier Inserate überlappen sich. */
function ueberlappen(a: MatchInserat, b: MatchInserat): boolean {
  return a.zuerstGesehen <= b.zuletztGesehen && b.zuerstGesehen <= a.zuletztGesehen;
}

function attributeAehnlich(a: MatchInserat, b: MatchInserat): boolean {
  if (Math.abs(a.flaeche_m2 - b.flaeche_m2) > FLAECHE_TOLERANZ_M2) return false;
  if (a.zimmer !== b.zimmer) return false;
  if (
    a.baujahr !== undefined &&
    b.baujahr !== undefined &&
    Math.abs(a.baujahr - b.baujahr) > BAUJAHR_TOLERANZ
  ) {
    return false;
  }
  return true;
}

function preisDelta(a: MatchInserat, b: MatchInserat): number {
  return Math.abs(a.preis - b.preis) / Math.max(a.preis, b.preis);
}

function preisAehnlichDuplikat(a: MatchInserat, b: MatchInserat): boolean {
  if (a.typ === 'kauf') return preisDelta(a, b) <= KAUF_PREIS_TOLERANZ;
  return preisDelta(a, b) <= MIETE_PREIS_TOLERANZ || Math.abs(a.preis - b.preis) <= MIETE_PREIS_TOLERANZ_EUR;
}

/**
 * Prüft, ob `neu` zu `mitglied` passt. `neu` ist nach Sortierung nie älter
 * als das Mitglied (zuerstGesehen aufsteigend).
 */
function regelFuerPaar(mitglied: MatchInserat, neu: MatchInserat): ZuordnungsRegel | undefined {
  if (!attributeAehnlich(mitglied, neu)) return undefined;
  if (ueberlappen(mitglied, neu)) {
    // Gleichzeitig gelistet: nur portal-übergreifend ein Duplikat.
    if (mitglied.portal === neu.portal) return undefined;
    return preisAehnlichDuplikat(mitglied, neu) ? 'duplikat' : undefined;
  }
  // Zeitlich disjunkt: Wiedereinstellung (gleiches oder anderes Portal).
  const luecke = tageZwischen(mitglied.zuletztGesehen, neu.zuerstGesehen);
  if (luecke < 0 || luecke > RELISTING_MAX_LUECKE_TAGE) return undefined;
  return preisDelta(mitglied, neu) <= RELISTING_PREIS_TOLERANZ ? 'relisting' : undefined;
}

interface Kandidat {
  gruppe: ObjektGruppe;
  regel: ZuordnungsRegel;
  deltaFlaecheM2: number;
  deltaPreisProzent: number;
  /** zuerstGesehen des ältesten Mitglieds — Tie-Break "ältestes Objekt". */
  aeltestes: string;
  /** Einfüge-Reihenfolge der Gruppe — stabiler letzter Tie-Break. */
  reihenfolge: number;
}

/**
 * Beste Match-Regel einer Gruppe für ein neues Inserat — oder undefined.
 * Eine Gruppe darf nie zwei zeitgleich gelistete Inserate desselben Portals
 * enthalten; überlappt das neue Inserat mit einem Portal-Geschwister, ist
 * die Gruppe tabu (auch wenn ein anderes Mitglied per Relisting passen würde).
 */
function pruefeGruppe(gruppe: ObjektGruppe, neu: MatchInserat): Omit<Kandidat, 'reihenfolge'> | undefined {
  let beste: { regel: ZuordnungsRegel; deltaFlaeche: number; deltaPreis: number } | undefined;
  for (const { inserat } of gruppe.mitglieder) {
    if (inserat.portal === neu.portal && ueberlappen(inserat, neu)) return undefined;
    const regel = regelFuerPaar(inserat, neu);
    if (regel === undefined) continue;
    const deltaFlaeche = Math.abs(inserat.flaeche_m2 - neu.flaeche_m2);
    const deltaPreis = preisDelta(inserat, neu);
    if (
      beste === undefined ||
      deltaFlaeche < beste.deltaFlaeche ||
      (deltaFlaeche === beste.deltaFlaeche && deltaPreis < beste.deltaPreis)
    ) {
      beste = { regel, deltaFlaeche, deltaPreis };
    }
  }
  if (beste === undefined) return undefined;
  return {
    gruppe,
    regel: beste.regel,
    deltaFlaecheM2: beste.deltaFlaeche,
    deltaPreisProzent: beste.deltaPreis,
    aeltestes: gruppe.mitglieder[0]!.inserat.zuerstGesehen,
  };
}

function kanonAus(inserat: MatchInserat): ObjektKanon {
  const kanon: ObjektKanon = {
    typ: inserat.typ,
    plz: normalisierePlz(inserat.plz, inserat.ort) ?? inserat.plz.trim(),
    ort: kanonischerOrt(inserat.ort),
    bezirk: inserat.bezirk,
    flaecheM2: inserat.flaeche_m2,
    zimmer: inserat.zimmer,
  };
  if (inserat.baujahr !== undefined) kanon.baujahr = inserat.baujahr;
  return kanon;
}

/** Feste Verarbeitungs-Reihenfolge — macht die Partition deterministisch. */
function sortiert(inserate: MatchInserat[]): MatchInserat[] {
  return [...inserate].sort(
    (a, b) =>
      a.zuerstGesehen.localeCompare(b.zuerstGesehen) ||
      a.portal.localeCompare(b.portal) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Partitioniert den Bestand in Objekt-Gruppen. Bereits zugeordnete Inserate
 * (objektId gesetzt) bleiben unverändert in ihrer Gruppe — sie bilden die
 * Saat; nur unzugeordnete Inserate werden gematcht (der Inkrement-Fall).
 * Für einen Rebuild vorher alle objektId-Felder leeren.
 */
export function ordneZu(inserate: MatchInserat[]): ObjektGruppe[] {
  const gruppen: ObjektGruppe[] = [];
  const reihenfolge = new Map<ObjektGruppe, number>();
  // Blocking über (typ, normalisierte PLZ) hält die Kandidatenmengen klein.
  const bloecke = new Map<string, ObjektGruppe[]>();
  const blockVon = (inserat: MatchInserat): ObjektGruppe[] => {
    const plz = normalisierePlz(inserat.plz, inserat.ort) ?? inserat.plz.trim();
    const schluessel = `${inserat.typ}|${plz}`;
    let block = bloecke.get(schluessel);
    if (block === undefined) {
      block = [];
      bloecke.set(schluessel, block);
    }
    return block;
  };
  const neueGruppe = (inserat: MatchInserat, regel: ObjektMitglied['regel'], objektId?: number): ObjektGruppe => {
    const gruppe: ObjektGruppe = { kanon: kanonAus(inserat), mitglieder: [{ inserat, regel }] };
    if (objektId !== undefined) gruppe.objektId = objektId;
    gruppen.push(gruppe);
    reihenfolge.set(gruppe, gruppen.length);
    blockVon(inserat).push(gruppe);
    return gruppe;
  };

  // 1. Saat: bestehende Zuordnungen unverändert übernehmen (Regeländerungen
  //    rollt ein expliziter Rebuild aus, kein Inkrement-Lauf).
  const bestehend = new Map<number, ObjektGruppe>();
  const offen: MatchInserat[] = [];
  for (const inserat of sortiert(inserate)) {
    if (inserat.objektId === undefined) {
      offen.push(inserat);
      continue;
    }
    const gruppe = bestehend.get(inserat.objektId);
    if (gruppe === undefined) {
      bestehend.set(inserat.objektId, neueGruppe(inserat, 'bestehend', inserat.objektId));
    } else {
      gruppe.mitglieder.push({ inserat, regel: 'bestehend' });
    }
  }

  // 2. Unzugeordnete in fester Reihenfolge matchen.
  for (const inserat of offen) {
    let bester: Kandidat | undefined;
    for (const gruppe of blockVon(inserat)) {
      const kandidat = pruefeGruppe(gruppe, inserat);
      if (kandidat === undefined) continue;
      const voll: Kandidat = { ...kandidat, reihenfolge: reihenfolge.get(gruppe)! };
      if (
        bester === undefined ||
        voll.deltaFlaecheM2 < bester.deltaFlaecheM2 ||
        (voll.deltaFlaecheM2 === bester.deltaFlaecheM2 &&
          (voll.deltaPreisProzent < bester.deltaPreisProzent ||
            (voll.deltaPreisProzent === bester.deltaPreisProzent &&
              (voll.aeltestes < bester.aeltestes ||
                (voll.aeltestes === bester.aeltestes && voll.reihenfolge < bester.reihenfolge)))))
      ) {
        bester = voll;
      }
    }
    if (bester === undefined) {
      neueGruppe(inserat, 'neu');
    } else {
      bester.gruppe.mitglieder.push({
        inserat,
        regel: bester.regel,
        details: {
          deltaFlaecheM2: bester.deltaFlaecheM2,
          deltaPreisProzent: Math.round(bester.deltaPreisProzent * 1000) / 10,
        },
      });
    }
  }

  return gruppen;
}
