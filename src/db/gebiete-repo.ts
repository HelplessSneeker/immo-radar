import type { SuchKriterien, SuchTyp } from '../search.js';
import { holePool } from './client.js';

/** Persistenz der Beobachtungsgebiete (Watchlist) und ihrer Crawl-Läufe. */

export interface Gebiet {
  id: number;
  name: string;
  kriterien: SuchKriterien;
  aktiv: boolean;
  erstelltAm: Date;
}

export type CrawlLaufStatus = 'laufend' | 'fertig' | 'fehlgeschlagen';

export interface CrawlLauf {
  id: number;
  gebietId: number;
  laufDatum: string; // YYYY-MM-DD
  status: CrawlLaufStatus;
  quellen: string[];
  fehler?: string;
  inserateGesehen?: number;
  gestartetAm: Date;
  beendetAm?: Date;
}

export interface GebietZeile {
  id: number;
  name: string;
  bundesland: string;
  typ: SuchTyp;
  preis_min: number | null;
  preis_max: number | null;
  flaeche_min: number | null;
  flaeche_max: number | null;
  zimmer_min: number | null;
  zimmer_max: number | null;
  ort: string | null;
  aktiv: boolean;
  erstellt_am: Date;
}

export interface CrawlLaufZeile {
  id: number;
  gebiet_id: number;
  lauf_datum: string; // als ::text selektiert
  status: CrawlLaufStatus;
  quellen: string[] | null;
  fehler: string | null;
  inserate_gesehen: number | null;
  gestartet_am: Date;
  beendet_am: Date | null;
}

export function gebietAusZeile(z: GebietZeile): Gebiet {
  const kriterien: SuchKriterien = { bundesland: z.bundesland, typ: z.typ };
  if (z.preis_min !== null) kriterien.preisMin = z.preis_min;
  if (z.preis_max !== null) kriterien.preisMax = z.preis_max;
  if (z.flaeche_min !== null) kriterien.flaecheMin = z.flaeche_min;
  if (z.flaeche_max !== null) kriterien.flaecheMax = z.flaeche_max;
  if (z.zimmer_min !== null) kriterien.zimmerMin = z.zimmer_min;
  if (z.zimmer_max !== null) kriterien.zimmerMax = z.zimmer_max;
  if (z.ort !== null) kriterien.ort = z.ort;
  return { id: z.id, name: z.name, kriterien, aktiv: z.aktiv, erstelltAm: z.erstellt_am };
}

export function crawlLaufAusZeile(z: CrawlLaufZeile): CrawlLauf {
  const lauf: CrawlLauf = {
    id: z.id,
    gebietId: z.gebiet_id,
    laufDatum: z.lauf_datum,
    status: z.status,
    quellen: z.quellen ?? [],
    gestartetAm: z.gestartet_am,
  };
  if (z.fehler !== null) lauf.fehler = z.fehler;
  if (z.inserate_gesehen !== null) lauf.inserateGesehen = z.inserate_gesehen;
  if (z.beendet_am !== null) lauf.beendetAm = z.beendet_am;
  return lauf;
}

export async function gebietAnlegen(name: string, kriterien: SuchKriterien): Promise<number> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO gebiete (name, bundesland, typ, preis_min, preis_max, flaeche_min,
                          flaeche_max, zimmer_min, zimmer_max, ort)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      name,
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

export async function gebietLaden(id: number): Promise<Gebiet | undefined> {
  const { rows } = await holePool().query<GebietZeile>('SELECT * FROM gebiete WHERE id = $1', [id]);
  return rows[0] ? gebietAusZeile(rows[0]) : undefined;
}

export async function gebieteAuflisten(nurAktive = false): Promise<Gebiet[]> {
  const { rows } = await holePool().query<GebietZeile>(
    `SELECT * FROM gebiete ${nurAktive ? 'WHERE aktiv' : ''} ORDER BY id`,
  );
  return rows.map(gebietAusZeile);
}

/**
 * Löscht ein Gebiet endgültig; die Crawl-Läufe hängen per ON DELETE CASCADE
 * daran. Der Inseratsbestand ist bundesland-weit und bleibt unberührt.
 */
export async function gebietLoeschen(id: number): Promise<void> {
  await holePool().query('DELETE FROM gebiete WHERE id = $1', [id]);
}

/** IDs aller Gebiete mit gerade laufendem Crawl – für „läuft"-Badges. */
export async function laufendeCrawls(): Promise<Set<number>> {
  const { rows } = await holePool().query<{ gebiet_id: number }>(
    "SELECT DISTINCT gebiet_id FROM crawl_laeufe WHERE status = 'laufend'",
  );
  return new Set(rows.map((r) => r.gebiet_id));
}

export async function gebietDeaktivieren(id: number): Promise<void> {
  await holePool().query('UPDATE gebiete SET aktiv = false WHERE id = $1', [id]);
}

export async function gebietAktivieren(id: number): Promise<void> {
  await holePool().query('UPDATE gebiete SET aktiv = true WHERE id = $1', [id]);
}

/**
 * Beansprucht den heutigen Crawl-Lauf eines Gebiets atomar: liefert eine
 * Lauf-ID genau dann, wenn an dem Tag noch nicht gecrawlt wurde oder der
 * Lauf fehlgeschlagen war (Retry). Läuft oder fertig ⇒ undefined. Der
 * UNIQUE-Constraint macht das auch über mehrere Prozesse hinweg race-sicher.
 */
export async function crawlLaufBeanspruchen(
  gebietId: number,
  datum: string,
): Promise<number | undefined> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO crawl_laeufe (gebiet_id, lauf_datum) VALUES ($1, $2)
     ON CONFLICT (gebiet_id, lauf_datum) DO UPDATE
       SET status = 'laufend', fehler = NULL, gestartet_am = now(), beendet_am = NULL
       WHERE crawl_laeufe.status = 'fehlgeschlagen'
     RETURNING id`,
    [gebietId, datum],
  );
  return rows[0]?.id;
}

/**
 * Wie crawlLaufBeanspruchen, aber für den manuellen "Jetzt crawlen"-Button:
 * beansprucht den heutigen Lauf auch dann, wenn er schon fertig ist. Nur ein
 * gerade laufender Crawl liefert undefined (kein Doppel-Crawl).
 */
export async function crawlLaufErzwingen(
  gebietId: number,
  datum: string,
): Promise<number | undefined> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO crawl_laeufe (gebiet_id, lauf_datum) VALUES ($1, $2)
     ON CONFLICT (gebiet_id, lauf_datum) DO UPDATE
       SET status = 'laufend', fehler = NULL, gestartet_am = now(), beendet_am = NULL
       WHERE crawl_laeufe.status <> 'laufend'
     RETURNING id`,
    [gebietId, datum],
  );
  return rows[0]?.id;
}

export async function crawlLaufAbschliessen(
  id: number,
  quellen: string[],
  inserateGesehen: number,
): Promise<void> {
  await holePool().query(
    `UPDATE crawl_laeufe
     SET status = 'fertig', quellen = $2::jsonb, inserate_gesehen = $3, beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, JSON.stringify(quellen), inserateGesehen],
  );
}

export async function crawlLaufFehlgeschlagen(id: number, meldung: string): Promise<void> {
  await holePool().query(
    `UPDATE crawl_laeufe SET status = 'fehlgeschlagen', fehler = $2, beendet_am = now()
     WHERE id = $1 AND status = 'laufend'`,
    [id, meldung],
  );
}

export interface FertigerLauf {
  laufDatum: string; // YYYY-MM-DD, der Stichtag für den Aktiv-Snapshot
  beendetAm: Date; // präziser Abschluss-Zeitpunkt für „Zuletzt gecrawlt“
}

/** Jüngster erfolgreicher Lauf eines Gebiets – Stichtag + Abschluss-Zeitpunkt. */
export async function letzterFertigerLauf(gebietId: number): Promise<FertigerLauf | undefined> {
  const { rows } = await holePool().query<{ lauf_datum: string; beendet_am: Date }>(
    `SELECT lauf_datum::text AS lauf_datum, beendet_am
     FROM crawl_laeufe WHERE gebiet_id = $1 AND status = 'fertig'
     ORDER BY lauf_datum DESC LIMIT 1`,
    [gebietId],
  );
  const zeile = rows[0];
  return zeile ? { laufDatum: zeile.lauf_datum, beendetAm: zeile.beendet_am } : undefined;
}

/** Abschluss-Zeitpunkt des letzten erfolgreichen Laufs je Gebiet – ein Query für die Liste. */
export async function letzteFertigeLaeufe(): Promise<Map<number, Date>> {
  const { rows } = await holePool().query<{ gebiet_id: number; beendet_am: Date }>(
    `SELECT gebiet_id, max(beendet_am) AS beendet_am
     FROM crawl_laeufe WHERE status = 'fertig' GROUP BY gebiet_id`,
  );
  return new Map(rows.map((r) => [r.gebiet_id, r.beendet_am]));
}

export async function crawlLaeufeAuflisten(gebietId: number, limit: number): Promise<CrawlLauf[]> {
  const { rows } = await holePool().query<CrawlLaufZeile>(
    `SELECT id, gebiet_id, lauf_datum::text AS lauf_datum, status, quellen, fehler,
            inserate_gesehen, gestartet_am, beendet_am
     FROM crawl_laeufe WHERE gebiet_id = $1 ORDER BY lauf_datum DESC LIMIT $2`,
    [gebietId, limit],
  );
  return rows.map(crawlLaufAusZeile);
}

/** Beim Serverstart: nach einem Neustart hängengebliebene Läufe abräumen. */
export async function zombieCrawlLaeufeBereinigen(): Promise<number> {
  const ergebnis = await holePool().query(
    `UPDATE crawl_laeufe
     SET status = 'fehlgeschlagen', fehler = 'Server wurde während des Crawls neu gestartet.',
         beendet_am = now()
     WHERE status = 'laufend'`,
  );
  return ergebnis.rowCount ?? 0;
}
