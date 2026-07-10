import type { InseratTyp } from '../types.js';
import { holePool } from './client.js';

/**
 * Persistenz des täglichen Kärnten-Sweeps: ein Lauf pro Tag (Claim über
 * UNIQUE lauf_datum), zerlegt in Segmente (Portal × Bezirk × Typ ×
 * optionales Preisband). Fertige Segmente überleben einen Neustart — der
 * wiederaufgenommene Lauf desselben Tages überspringt sie.
 */

export type SweepStatus = 'laufend' | 'fertig' | 'fehlgeschlagen';

export interface SweepLauf {
  id: number;
  laufDatum: string; // YYYY-MM-DD
  status: SweepStatus;
  fehler?: string;
  inserateGesehen?: number;
  gestartetAm: Date;
  beendetAm?: Date;
}

export interface SweepSegmentKey {
  portal: string;
  /** Bezirk-Schlüssel aus BEZIRKE_KAERNTEN oder BEZIRK_GESAMT. */
  bezirk: string;
  typ: InseratTyp;
  preisMin?: number;
  preisMax?: number;
}

export interface SweepSegment extends SweepSegmentKey {
  id: number;
  laufDatum: string;
  status: SweepStatus;
  quelle?: string;
  inserateGeladen?: number;
  gesamtTreffer?: number;
  gestartetAm: Date;
  beendetAm?: Date;
}

interface SweepLaufZeile {
  id: number;
  lauf_datum: string; // als ::text selektiert
  status: SweepStatus;
  fehler: string | null;
  inserate_gesehen: number | null;
  gestartet_am: Date;
  beendet_am: Date | null;
}

interface SweepSegmentZeile {
  id: number;
  lauf_datum: string;
  portal: string;
  bezirk: string;
  typ: InseratTyp;
  preis_min: number | null;
  preis_max: number | null;
  status: SweepStatus;
  quelle: string | null;
  inserate_geladen: number | null;
  gesamt_treffer: number | null;
  gestartet_am: Date;
  beendet_am: Date | null;
}

function sweepLaufAusZeile(z: SweepLaufZeile): SweepLauf {
  const lauf: SweepLauf = {
    id: z.id,
    laufDatum: z.lauf_datum,
    status: z.status,
    gestartetAm: z.gestartet_am,
  };
  if (z.fehler !== null) lauf.fehler = z.fehler;
  if (z.inserate_gesehen !== null) lauf.inserateGesehen = z.inserate_gesehen;
  if (z.beendet_am !== null) lauf.beendetAm = z.beendet_am;
  return lauf;
}

function sweepSegmentAusZeile(z: SweepSegmentZeile): SweepSegment {
  const segment: SweepSegment = {
    id: z.id,
    laufDatum: z.lauf_datum,
    portal: z.portal,
    bezirk: z.bezirk,
    typ: z.typ,
    status: z.status,
    gestartetAm: z.gestartet_am,
  };
  if (z.preis_min !== null) segment.preisMin = z.preis_min;
  if (z.preis_max !== null) segment.preisMax = z.preis_max;
  if (z.quelle !== null) segment.quelle = z.quelle;
  if (z.inserate_geladen !== null) segment.inserateGeladen = z.inserate_geladen;
  if (z.gesamt_treffer !== null) segment.gesamtTreffer = z.gesamt_treffer;
  if (z.beendet_am !== null) segment.beendetAm = z.beendet_am;
  return segment;
}

/** Kanonischer Schlüssel eines Segments — für das Skip-Set beim Resume. */
export function segmentSchluessel(key: SweepSegmentKey): string {
  return [key.portal, key.bezirk, key.typ, key.preisMin ?? '', key.preisMax ?? ''].join('|');
}

/**
 * Beansprucht den heutigen Sweep atomar: liefert eine Lauf-ID genau dann,
 * wenn heute noch nicht gesweept wurde oder der Lauf fehlgeschlagen war
 * (Retry — der erbt die fertigen Segmente des Tages). Läuft oder fertig ⇒
 * undefined. Race-sicher über UNIQUE (lauf_datum), auch über Prozesse hinweg.
 */
export async function sweepBeanspruchen(datum: string): Promise<number | undefined> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO sweep_laeufe (lauf_datum) VALUES ($1)
     ON CONFLICT (lauf_datum) DO UPDATE
       SET status = 'laufend', fehler = NULL, gestartet_am = now(), beendet_am = NULL
       WHERE sweep_laeufe.status = 'fehlgeschlagen'
     RETURNING id`,
    [datum],
  );
  return rows[0]?.id;
}

export async function sweepAbschliessen(id: number, inserateGesehen: number): Promise<void> {
  await holePool().query(
    `UPDATE sweep_laeufe
     SET status = 'fertig', inserate_gesehen = $2, beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, inserateGesehen],
  );
}

export async function sweepFehlgeschlagen(id: number, meldung: string): Promise<void> {
  await holePool().query(
    `UPDATE sweep_laeufe SET status = 'fehlgeschlagen', fehler = $2, beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, meldung],
  );
}

/**
 * Beansprucht ein Segment des Tages: neue Segmente werden angelegt,
 * fehlgeschlagene zurückgesetzt (Retry). Ein fertiges Segment liefert
 * undefined — der Aufrufer überspringt es.
 */
export async function segmentBeanspruchen(
  datum: string,
  key: SweepSegmentKey,
): Promise<number | undefined> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO sweep_segmente (lauf_datum, portal, bezirk, typ, preis_min, preis_max)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (lauf_datum, portal, bezirk, typ, preis_min, preis_max) DO UPDATE
       SET status = 'laufend', quelle = NULL, gestartet_am = now(), beendet_am = NULL
       WHERE sweep_segmente.status <> 'fertig'
     RETURNING id`,
    [datum, key.portal, key.bezirk, key.typ, key.preisMin ?? null, key.preisMax ?? null],
  );
  return rows[0]?.id;
}

export async function segmentAbschliessen(
  id: number,
  quelle: string,
  inserateGeladen: number,
  gesamtTreffer: number,
): Promise<void> {
  await holePool().query(
    `UPDATE sweep_segmente
     SET status = 'fertig', quelle = $2, inserate_geladen = $3, gesamt_treffer = $4,
         beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, quelle, inserateGeladen, gesamtTreffer],
  );
}

export async function segmentFehlgeschlagen(id: number, meldung: string): Promise<void> {
  await holePool().query(
    `UPDATE sweep_segmente SET status = 'fehlgeschlagen', quelle = $2, beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, meldung],
  );
}

/** Schlüssel aller heute schon fertigen Segmente — das Skip-Set beim Resume. */
export async function fertigeSegmente(datum: string): Promise<Set<string>> {
  const { rows } = await holePool().query<SweepSegmentZeile>(
    `SELECT id, lauf_datum::text AS lauf_datum, portal, bezirk, typ, preis_min, preis_max,
            status, quelle, inserate_geladen, gesamt_treffer, gestartet_am, beendet_am
     FROM sweep_segmente WHERE lauf_datum = $1 AND status = 'fertig'`,
    [datum],
  );
  return new Set(rows.map((z) => segmentSchluessel(sweepSegmentAusZeile(z))));
}

/** Jüngster erfolgreicher Sweep — der Stichtag für Dashboard und Trends. */
export async function letzterFertigerSweep(): Promise<
  { laufDatum: string; beendetAm: Date } | undefined
> {
  const { rows } = await holePool().query<{ lauf_datum: string; beendet_am: Date }>(
    `SELECT lauf_datum::text AS lauf_datum, beendet_am
     FROM sweep_laeufe WHERE status = 'fertig'
     ORDER BY lauf_datum DESC LIMIT 1`,
  );
  const zeile = rows[0];
  return zeile ? { laufDatum: zeile.lauf_datum, beendetAm: zeile.beendet_am } : undefined;
}

/** Aufsteigende lauf_datum aller fertigen Sweeps — die Stichtage der Zeitreihen. */
export async function fertigeSweepTage(): Promise<string[]> {
  const { rows } = await holePool().query<{ lauf_datum: string }>(
    `SELECT lauf_datum::text AS lauf_datum
     FROM sweep_laeufe WHERE status = 'fertig'
     ORDER BY lauf_datum`,
  );
  return rows.map((z) => z.lauf_datum);
}

/** Gerade laufender Sweep — für den Aktivitäts-Indikator im Kopf. */
export async function laufenderSweep(): Promise<SweepLauf | undefined> {
  const { rows } = await holePool().query<SweepLaufZeile>(
    `SELECT id, lauf_datum::text AS lauf_datum, status, fehler, inserate_gesehen,
            gestartet_am, beendet_am
     FROM sweep_laeufe WHERE status = 'laufend' ORDER BY lauf_datum DESC LIMIT 1`,
  );
  return rows[0] ? sweepLaufAusZeile(rows[0]) : undefined;
}

export async function sweepLaeufeAuflisten(limit: number): Promise<SweepLauf[]> {
  const { rows } = await holePool().query<SweepLaufZeile>(
    `SELECT id, lauf_datum::text AS lauf_datum, status, fehler, inserate_gesehen,
            gestartet_am, beendet_am
     FROM sweep_laeufe ORDER BY lauf_datum DESC LIMIT $1`,
    [limit],
  );
  return rows.map(sweepLaufAusZeile);
}

export async function segmenteFuerDatum(datum: string): Promise<SweepSegment[]> {
  const { rows } = await holePool().query<SweepSegmentZeile>(
    `SELECT id, lauf_datum::text AS lauf_datum, portal, bezirk, typ, preis_min, preis_max,
            status, quelle, inserate_geladen, gesamt_treffer, gestartet_am, beendet_am
     FROM sweep_segmente WHERE lauf_datum = $1
     ORDER BY gestartet_am, id`,
    [datum],
  );
  return rows.map(sweepSegmentAusZeile);
}

/** Beim Serverstart: nach einem Neustart hängengebliebene Sweeps abräumen. */
export async function zombieSweepsBereinigen(): Promise<number> {
  const pool = holePool();
  await pool.query(
    `UPDATE sweep_segmente
     SET status = 'fehlgeschlagen', quelle = 'Server wurde während des Sweeps neu gestartet.',
         beendet_am = now()
     WHERE status = 'laufend'`,
  );
  const ergebnis = await pool.query(
    `UPDATE sweep_laeufe
     SET status = 'fehlgeschlagen', fehler = 'Server wurde während des Sweeps neu gestartet.',
         beendet_am = now()
     WHERE status = 'laufend'`,
  );
  return ergebnis.rowCount ?? 0;
}
