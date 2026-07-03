import type pg from 'pg';
import type { SuchKriterien, SuchTyp } from '../search.js';
import type { Inserat, InseratTyp } from '../types.js';
import { holePool } from './client.js';

/** Persistenz der Suchläufe und ihrer Treffer. */

export type SucheStatus = 'laufend' | 'fertig' | 'fehlgeschlagen';

export interface Suche {
  id: number;
  status: SucheStatus;
  kriterien: SuchKriterien;
  /** Quellen-Statuszeilen für den Report; leer solange die Suche läuft. */
  quellen: string[];
  fehler?: string;
  erstelltAm: Date;
  beendetAm?: Date;
  /** Anzahl gespeicherter Treffer (0 solange die Suche läuft). */
  treffer: number;
}

export interface SucheZeile {
  id: number;
  status: SucheStatus;
  bundesland: string;
  typ: SuchTyp;
  preis_min: number | null;
  preis_max: number | null;
  flaeche_min: number | null;
  flaeche_max: number | null;
  zimmer_min: number | null;
  zimmer_max: number | null;
  ort: string | null;
  quellen: string[] | null;
  fehler: string | null;
  erstellt_am: Date;
  beendet_am: Date | null;
  treffer: number;
}

export interface InseratZeile {
  inserat_id: string;
  typ: InseratTyp;
  ort: string;
  plz: string;
  bezirk: string;
  preis: number;
  flaeche_m2: number;
  zimmer: number;
  baujahr: number | null;
  zustand: string | null;
  url: string | null;
  datum_erfasst: string; // als ::text selektiert – pg-Date wäre lokale Mitternacht
}

export function sucheAusZeile(z: SucheZeile): Suche {
  const kriterien: SuchKriterien = { bundesland: z.bundesland, typ: z.typ };
  if (z.preis_min !== null) kriterien.preisMin = z.preis_min;
  if (z.preis_max !== null) kriterien.preisMax = z.preis_max;
  if (z.flaeche_min !== null) kriterien.flaecheMin = z.flaeche_min;
  if (z.flaeche_max !== null) kriterien.flaecheMax = z.flaeche_max;
  if (z.zimmer_min !== null) kriterien.zimmerMin = z.zimmer_min;
  if (z.zimmer_max !== null) kriterien.zimmerMax = z.zimmer_max;
  if (z.ort !== null) kriterien.ort = z.ort;

  const suche: Suche = {
    id: z.id,
    status: z.status,
    kriterien,
    quellen: z.quellen ?? [],
    erstelltAm: z.erstellt_am,
    treffer: z.treffer,
  };
  if (z.fehler !== null) suche.fehler = z.fehler;
  if (z.beendet_am !== null) suche.beendetAm = z.beendet_am;
  return suche;
}

export function inseratAusZeile(z: InseratZeile): Inserat {
  const inserat: Inserat = {
    id: z.inserat_id,
    typ: z.typ,
    ort: z.ort,
    plz: z.plz,
    bezirk: z.bezirk,
    preis: z.preis,
    flaeche_m2: z.flaeche_m2,
    zimmer: z.zimmer,
    datum_erfasst: z.datum_erfasst,
  };
  if (z.baujahr !== null) inserat.baujahr = z.baujahr;
  if (z.zustand !== null) inserat.zustand = z.zustand;
  if (z.url !== null) inserat.url = z.url;
  return inserat;
}

const SUCHE_SELECT = `
  SELECT s.*,
         (SELECT count(*)::int FROM inserate i WHERE i.suche_id = s.id) AS treffer
  FROM suchen s`;

export async function sucheAnlegen(kriterien: SuchKriterien): Promise<number> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO suchen (bundesland, typ, preis_min, preis_max, flaeche_min, flaeche_max,
                         zimmer_min, zimmer_max, ort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      kriterien.bundesland,
      kriterien.typ,
      kriterien.preisMin ?? null,
      kriterien.preisMax ?? null,
      kriterien.flaecheMin ?? null,
      kriterien.flaecheMax ?? null,
      kriterien.zimmerMin ?? null,
      kriterien.zimmerMax ?? null,
      kriterien.ort ?? null,
    ],
  );
  return rows[0]!.id;
}

/** Treffer speichern und Suche auf "fertig" stellen – in einer Transaktion. */
export async function sucheAbschliessen(
  id: number,
  quellen: string[],
  inserate: Inserat[],
): Promise<void> {
  const client = await holePool().connect();
  try {
    await client.query('BEGIN');
    for (const i of inserate) {
      await client.query(
        `INSERT INTO inserate (suche_id, inserat_id, typ, ort, plz, bezirk, preis,
                               flaeche_m2, zimmer, baujahr, zustand, url, datum_erfasst)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          i.id,
          i.typ,
          i.ort,
          i.plz,
          i.bezirk,
          i.preis,
          i.flaeche_m2,
          i.zimmer,
          i.baujahr ?? null,
          i.zustand ?? null,
          i.url ?? null,
          i.datum_erfasst,
        ],
      );
    }
    await client.query(
      `UPDATE suchen SET status = 'fertig', quellen = $2::jsonb, beendet_am = now()
       WHERE id = $1 AND status = 'laufend'`,
      [id, JSON.stringify(quellen)],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function sucheFehlgeschlagen(id: number, meldung: string): Promise<void> {
  await holePool().query(
    `UPDATE suchen SET status = 'fehlgeschlagen', fehler = $2, beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, meldung],
  );
}

export async function sucheLaden(id: number): Promise<Suche | undefined> {
  const { rows } = await holePool().query<SucheZeile>(`${SUCHE_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ? sucheAusZeile(rows[0]) : undefined;
}

export async function inserateLaden(sucheId: number): Promise<Inserat[]> {
  const { rows } = await holePool().query<InseratZeile>(
    `SELECT inserat_id, typ, ort, plz, bezirk, preis, flaeche_m2, zimmer, baujahr,
            zustand, url, datum_erfasst::text AS datum_erfasst
     FROM inserate WHERE suche_id = $1 ORDER BY id`,
    [sucheId],
  );
  return rows.map(inseratAusZeile);
}

export async function suchenAuflisten(limit?: number): Promise<Suche[]> {
  const { rows } = await holePool().query<SucheZeile>(
    `${SUCHE_SELECT} ORDER BY s.id DESC ${limit !== undefined ? 'LIMIT $1' : ''}`,
    limit !== undefined ? [limit] : [],
  );
  return rows.map(sucheAusZeile);
}

/** Aktuell laufende Suchen – für den Aktivitäts-Indikator im Kopf. */
export async function laufendeSuchen(): Promise<Suche[]> {
  const { rows } = await holePool().query<SucheZeile>(
    `${SUCHE_SELECT} WHERE s.status = 'laufend' ORDER BY s.id DESC`,
  );
  return rows.map(sucheAusZeile);
}

/** Beim Serverstart: nach einem Neustart hängengebliebene Suchen abräumen. */
export async function zombieSuchenBereinigen(): Promise<number> {
  const ergebnis = await holePool().query(
    `UPDATE suchen
     SET status = 'fehlgeschlagen', fehler = 'Server wurde während der Suche neu gestartet.',
         beendet_am = now()
     WHERE status = 'laufend'`,
  );
  return ergebnis.rowCount ?? 0;
}
