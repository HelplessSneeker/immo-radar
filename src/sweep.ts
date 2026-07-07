import { setTimeout as warte } from 'node:timers/promises';
import { PortalFehler, type PortalAdapter } from './adapters/portal-adapter.js';
import { BEZIRKE_KAERNTEN, BEZIRK_GESAMT, KAERNTEN, bezirkName } from './bezirke.js';
import { bestandUpsert } from './db/bestand-repo.js';
import {
  fertigeSegmente,
  segmentAbschliessen,
  segmentBeanspruchen,
  segmentFehlgeschlagen,
  segmentSchluessel,
  sweepAbschliessen,
  sweepBeanspruchen,
  sweepFehlgeschlagen,
  type SweepSegmentKey,
} from './db/sweep-repo.js';
import { objekteZuordnungsLauf } from './db/objekte-repo.js';
import { heutigesDatum } from './datum.js';
import { mitCrawlSperre } from './crawl.js';
import type { OrtPortal } from './ort-slugs.js';
import type { InseratTyp } from './types.js';
import type { SuchKriterien } from './search.js';

/**
 * Der tägliche Kärnten-Sweep: crawlt alle Wohnungen (Kauf + Miete, beide
 * Portale), partitioniert je Bezirk, damit die Portal-Caps nicht zur
 * Stichprobe zwingen. Sättigt ein Segment trotzdem (mehr Treffer als
 * ladbar), wird es in Preisbänder zerlegt, notfalls rekursiv halbiert.
 * Jedes Segment schreibt sofort in den Bestand — ein Neustart setzt den
 * Tages-Sweep beim ersten unfertigen Segment fort.
 */

/** Seiten-Deckel je Segment-URL: 15 Seiten ⇒ ~450 (willhaben) / ~225 (is24) Inserate. */
const SWEEP_MAX_SEITEN = 15;
/** Pause zwischen Segment-Crawls — portal-schonend, per Env übersteuerbar. */
const SEGMENT_PAUSE_MS_DEFAULT = 15_000;
/** Tiefe 0 = Bezirk ganz, 1 = feste Preisbänder, 2–3 = halbierte Bänder. */
const MAX_SPLIT_TIEFE = 3;

// Feste erste Preisbänder je Typ — so gewählt, dass auch Klagenfurt-große
// Teilmärkte deutlich unter den ~450/~225 Inseraten pro Band bleiben.
const KAUF_GRENZEN = [150_000, 250_000, 400_000];
const MIETE_GRENZEN = [700, 1000, 1400];

/** Adapter-Portalname → Slug-Spalte in BEZIRKE_KAERNTEN/ORT_SLUGS. */
const PORTAL_SLUG_SPALTE: Record<string, OrtPortal> = {
  'willhaben.at': 'willhaben',
  'immoscout24.at': 'immoscout24',
};

export interface SweepDeps {
  sweepBeanspruchen: typeof sweepBeanspruchen;
  sweepAbschliessen: typeof sweepAbschliessen;
  sweepFehlgeschlagen: typeof sweepFehlgeschlagen;
  segmentBeanspruchen: typeof segmentBeanspruchen;
  segmentAbschliessen: typeof segmentAbschliessen;
  segmentFehlgeschlagen: typeof segmentFehlgeschlagen;
  fertigeSegmente: typeof fertigeSegmente;
  bestandUpsert: typeof bestandUpsert;
  mitCrawlSperre: typeof mitCrawlSperre;
  /** Objekt-Matching (Dedup) nach dem letzten Segment. */
  objekteZuordnen: () => Promise<{ neueObjekte: number; zugeordnet: number }>;
  heute: () => string;
  warte: (ms: number) => Promise<void>;
  segmentPauseMs: number;
}

const ECHTE_DEPS: SweepDeps = {
  sweepBeanspruchen,
  sweepAbschliessen,
  sweepFehlgeschlagen,
  segmentBeanspruchen,
  segmentAbschliessen,
  segmentFehlgeschlagen,
  fertigeSegmente,
  bestandUpsert,
  mitCrawlSperre,
  objekteZuordnen: () => objekteZuordnungsLauf(KAERNTEN),
  heute: heutigesDatum,
  warte: (ms) => warte(ms),
  segmentPauseMs: Number(process.env.SWEEP_SEGMENT_PAUSE_MS ?? SEGMENT_PAUSE_MS_DEFAULT),
};

/** Ein Basis-Segment des Sweeps (ohne Preisband). */
export interface BasisSegment {
  bezirk: string;
  typ: InseratTyp;
}

/**
 * Basis-Segmente eines Portals: alle Bezirke mit verifiziertem Slug, plus —
 * sobald auch nur ein Bezirk keinen Slug hat — ein Kärnten-weites
 * Rest-Segment, das die Lücken abdeckt (Überlappung ist harmlos, der
 * Bestand-Upsert dedupliziert).
 */
export function basisSegmente(portalName: string): BasisSegment[] {
  const spalte = PORTAL_SLUG_SPALTE[portalName];
  const mitSlug = spalte ? BEZIRKE_KAERNTEN.filter((b) => b[spalte] !== undefined) : [];
  const bezirke = mitSlug.map((b) => b.schluessel);
  if (mitSlug.length < BEZIRKE_KAERNTEN.length) bezirke.push(BEZIRK_GESAMT);
  const segmente: BasisSegment[] = [];
  for (const bezirk of bezirke) {
    segmente.push({ bezirk, typ: 'kauf' }, { bezirk, typ: 'miete' });
  }
  return segmente;
}

/** Preisband eines Segments; undefined = nach unten/oben offen. */
export interface PreisBand {
  preisMin?: number;
  preisMax?: number;
}

/**
 * Die Kind-Bänder eines gesättigten Segments: auf Tiefe 0 die festen
 * Typ-Bänder, danach wird das Band halbiert (offene Enden am Rand-Band
 * verdoppeln/halbieren die bekannte Grenze).
 */
export function preisBaender(typ: InseratTyp, band: PreisBand, tiefe: number): PreisBand[] {
  if (tiefe === 0) {
    const grenzen = typ === 'kauf' ? KAUF_GRENZEN : MIETE_GRENZEN;
    const baender: PreisBand[] = [{ preisMax: grenzen[0]! }];
    for (let i = 1; i < grenzen.length; i += 1) {
      baender.push({ preisMin: grenzen[i - 1]!, preisMax: grenzen[i]! });
    }
    baender.push({ preisMin: grenzen[grenzen.length - 1]! });
    return baender;
  }
  const mitte =
    band.preisMin === undefined
      ? Math.round(band.preisMax! / 2)
      : band.preisMax === undefined
        ? band.preisMin * 2
        : Math.round((band.preisMin + band.preisMax) / 2);
  return [
    { ...(band.preisMin !== undefined && { preisMin: band.preisMin }), preisMax: mitte },
    { preisMin: mitte, ...(band.preisMax !== undefined && { preisMax: band.preisMax }) },
  ];
}

interface SweepZustand {
  datum: string;
  ueberspringen: Set<string>;
  inserateGesehen: number;
  erledigt: number; // fertig oder übersprungen
  fehlgeschlagen: number;
  ersterFehler?: string;
  gecrawlt: boolean; // schon ein echter Crawl passiert? (steuert die Pause)
}

function bandText(band: PreisBand): string {
  if (band.preisMin === undefined && band.preisMax === undefined) return '';
  const teil = (n?: number) => (n === undefined ? '' : String(n));
  return `, ${teil(band.preisMin)}–${teil(band.preisMax)} €`;
}

/**
 * Crawlt ein Segment (und bei Sättigung rekursiv seine Preisband-Kinder,
 * bevor es selbst als fertig gilt — so gehen Kinder bei einem Neustart nie
 * verloren: ein unfertiges Eltern-Segment wird komplett wiederholt).
 */
async function crawleSegment(
  portal: PortalAdapter,
  basis: BasisSegment,
  band: PreisBand,
  tiefe: number,
  zustand: SweepZustand,
  deps: SweepDeps,
): Promise<void> {
  const key: SweepSegmentKey = { portal: portal.portal, bezirk: basis.bezirk, typ: basis.typ, ...band };
  if (zustand.ueberspringen.has(segmentSchluessel(key))) {
    zustand.erledigt += 1;
    return;
  }
  const segmentId = await deps.segmentBeanspruchen(zustand.datum, key);
  if (segmentId === undefined) {
    zustand.erledigt += 1; // race: parallel fertig geworden
    return;
  }

  if (zustand.gecrawlt) await deps.warte(deps.segmentPauseMs);
  zustand.gecrawlt = true;

  const name = `${portal.portal} ${bezirkName(basis.bezirk)}`;
  try {
    const kriterien: SuchKriterien = { bundesland: KAERNTEN, typ: basis.typ, ...band };
    if (basis.bezirk !== BEZIRK_GESAMT) kriterien.bezirk = basis.bezirk;
    const ergebnisse = await deps.mitCrawlSperre(() =>
      portal.sucheMitStatistik(kriterien, { maxSeiten: SWEEP_MAX_SEITEN }),
    );
    // typ ist nie 'beide' ⇒ genau ein Ergebnis pro Segment.
    const ergebnis = ergebnisse[0]!;
    await deps.bestandUpsert(
      ergebnis.inserate.map((i) => ({ ...i, portal: portal.portal })),
      KAERNTEN,
      zustand.datum,
    );
    zustand.inserateGesehen += ergebnis.inserate.length;

    const geladen = ergebnis.inserate.length + ergebnis.uebersprungen;
    const gesaettigt = ergebnis.gesamtTreffer > geladen;
    let quelle =
      `${name} (${basis.typ === 'kauf' ? 'Kauf' : 'Miete'}${bandText(band)}: ` +
      `${ergebnis.inserate.length} von ${ergebnis.gesamtTreffer} Inseraten geladen)`;
    if (gesaettigt && tiefe < MAX_SPLIT_TIEFE) {
      quelle += ' — gesättigt, in Preisbänder aufgeteilt';
      for (const kind of preisBaender(basis.typ, band, tiefe)) {
        await crawleSegment(portal, basis, kind, tiefe + 1, zustand, deps);
      }
    } else if (gesaettigt) {
      quelle += ' — weiterhin gesättigt (maximale Band-Tiefe), Rest bleibt Stichprobe';
      console.warn(`Sweep: ${quelle}`);
    }
    await deps.segmentAbschliessen(segmentId, quelle, ergebnis.inserate.length, ergebnis.gesamtTreffer);
    zustand.erledigt += 1;
  } catch (err) {
    // Auch Nicht-Portal-Fehler (z. B. DB) degradieren nur dieses Segment —
    // die übrigen Segmente sollen den Tag trotzdem abdecken.
    const meldung = err instanceof Error ? err.message : String(err);
    if (!(err instanceof PortalFehler)) console.error(`Sweep-Segment ${name} fehlgeschlagen:`, err);
    zustand.fehlgeschlagen += 1;
    zustand.ersterFehler ??= `${name}: ${meldung}`;
    try {
      await deps.segmentFehlgeschlagen(segmentId, `${name}: nicht abfragbar (${meldung})`);
    } catch (dbErr) {
      console.error(`Sweep-Segment ${name}: Status konnte nicht gespeichert werden:`, dbErr);
    }
  }
}

/**
 * Führt den heutigen Sweep aus, falls er noch aussteht (Claim in
 * sweep_laeufe). Liefert false, wenn heute schon gesweept wurde oder ein
 * Lauf gerade läuft. Ein fehlgeschlagenes Segment stoppt die anderen nicht;
 * der Sweep scheitert erst, wenn kein einziges Segment durchkommt.
 */
export async function fuehreSweepAus(
  portale: PortalAdapter[],
  deps: SweepDeps = ECHTE_DEPS,
): Promise<boolean> {
  const datum = deps.heute();
  const sweepId = await deps.sweepBeanspruchen(datum);
  if (sweepId === undefined) return false;

  const zustand: SweepZustand = {
    datum,
    ueberspringen: await deps.fertigeSegmente(datum),
    inserateGesehen: 0,
    erledigt: 0,
    fehlgeschlagen: 0,
    gecrawlt: false,
  };

  try {
    for (const portal of portale) {
      for (const basis of basisSegmente(portal.portal)) {
        await crawleSegment(portal, basis, {}, 0, zustand, deps);
      }
    }
    if (zustand.erledigt === 0) {
      await deps.sweepFehlgeschlagen(
        sweepId,
        `Kein Segment abfragbar: ${zustand.ersterFehler ?? 'unbekannter Fehler'}`,
      );
    } else {
      // Dedup nach dem Crawlen; ein Fehler hier kostet nie den Sweep — der
      // nächste Lauf ordnet die offenen Inserate nach.
      try {
        const { neueObjekte, zugeordnet } = await deps.objekteZuordnen();
        if (zugeordnet > 0) {
          console.log(`Sweep ${datum}: ${zugeordnet} Inserate zu Objekten zugeordnet (${neueObjekte} neu).`);
        }
      } catch (matchErr) {
        console.error(`Sweep ${datum}: Objekt-Zuordnung fehlgeschlagen:`, matchErr);
      }
      await deps.sweepAbschliessen(sweepId, zustand.inserateGesehen);
      const fehlerHinweis =
        zustand.fehlgeschlagen > 0 ? `, ${zustand.fehlgeschlagen} Segmente fehlgeschlagen` : '';
      console.log(
        `Sweep ${datum}: ${zustand.inserateGesehen} Inserate im Bestand aktualisiert` +
          ` (${zustand.erledigt} Segmente${fehlerHinweis}).`,
      );
    }
  } catch (err) {
    // Unerwarteter Fehler außerhalb der Segment-Schleife (z. B. DB weg).
    console.error(`Sweep ${datum} abgebrochen:`, err);
    const meldung = err instanceof Error ? err.message : String(err);
    try {
      await deps.sweepFehlgeschlagen(sweepId, meldung);
    } catch (dbErr) {
      console.error(`Sweep ${datum}: Status konnte nicht gespeichert werden:`, dbErr);
    }
  }
  return true;
}
