import type { InseratDetail } from '../types.js';
import { holePool } from './client.js';

/**
 * Kategorie-Felder der Portal-Detailseiten (inserat_details): eine Zeile pro
 * (portal, inserat_id), zugleich der Fetch-Cache des Detail-Crawls — existiert
 * die Zeile, wird die Detailseite nie erneut geladen.
 */

export interface InseratDetailZeile {
  portal: string;
  inserat_id: string;
  baujahr: number | null;
  zustand: string | null;
  baustil: string | null;
  heizung: string | null;
  ausstattung: string[] | null; // jsonb; pg parst beim Lesen automatisch
  energie_hwb: number | null;
  energie_fgee: number | null;
  beschreibung: string | null;
  detail_geholt_am: string; // ::text selektiert
}

export interface GespeichertesInseratDetail extends InseratDetail {
  portal: string;
  inseratId: string;
  detailGeholtAm: string;
}

export function inseratDetailAusZeile(z: InseratDetailZeile): GespeichertesInseratDetail {
  const detail: GespeichertesInseratDetail = {
    portal: z.portal,
    inseratId: z.inserat_id,
    detailGeholtAm: z.detail_geholt_am,
  };
  if (z.baujahr !== null) detail.baujahr = z.baujahr;
  if (z.zustand !== null) detail.zustand = z.zustand;
  if (z.baustil !== null) detail.baustil = z.baustil;
  if (z.heizung !== null) detail.heizung = z.heizung;
  if (z.ausstattung !== null) detail.ausstattung = z.ausstattung;
  if (z.energie_hwb !== null) detail.energieHwb = z.energie_hwb;
  if (z.energie_fgee !== null) detail.energieFgee = z.energie_fgee;
  if (z.beschreibung !== null) detail.beschreibung = z.beschreibung;
  return detail;
}

/**
 * Schreibt das Ergebnis eines Detail-Fetches — eine Zeile je Fetch, kein
 * Batch. ON CONFLICT hält den Upsert idempotent (Wiederholung nach Crash),
 * im Normalfall verhindert der Cache-Check jede zweite Ausführung.
 */
export async function detailUpsert(
  portal: string,
  inseratId: string,
  detail: InseratDetail,
): Promise<void> {
  await holePool().query(
    `INSERT INTO inserat_details
       (portal, inserat_id, baujahr, zustand, baustil, heizung, ausstattung,
        energie_hwb, energie_fgee, beschreibung)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
     ON CONFLICT (portal, inserat_id) DO UPDATE SET
       baujahr = EXCLUDED.baujahr, zustand = EXCLUDED.zustand,
       baustil = EXCLUDED.baustil, heizung = EXCLUDED.heizung,
       ausstattung = EXCLUDED.ausstattung, energie_hwb = EXCLUDED.energie_hwb,
       energie_fgee = EXCLUDED.energie_fgee, beschreibung = EXCLUDED.beschreibung,
       detail_geholt_am = now()`,
    [
      portal,
      inseratId,
      detail.baujahr ?? null,
      detail.zustand ?? null,
      detail.baustil ?? null,
      detail.heizung ?? null,
      // pg würde ein JS-Array als Postgres-Array serialisieren — jsonb braucht JSON-Text.
      detail.ausstattung !== undefined ? JSON.stringify(detail.ausstattung) : null,
      detail.energieHwb ?? null,
      detail.energieFgee ?? null,
      detail.beschreibung ?? null,
    ],
  );
}

export async function detailsLaden(bundesland: string): Promise<GespeichertesInseratDetail[]> {
  const { rows } = await holePool().query<InseratDetailZeile>(
    `SELECT d.portal, d.inserat_id, d.baujahr, d.zustand, d.baustil, d.heizung,
            d.ausstattung, d.energie_hwb, d.energie_fgee, d.beschreibung,
            d.detail_geholt_am::text AS detail_geholt_am
     FROM inserat_details d
     JOIN inserate_bestand b USING (portal, inserat_id)
     WHERE b.bundesland = $1
     ORDER BY d.portal, d.inserat_id`,
    [bundesland],
  );
  return rows.map(inseratDetailAusZeile);
}

/** Ein Inserat, dessen Detailseite noch aussteht. */
export interface DetailKandidat {
  portal: string;
  inseratId: string;
  url: string;
}

/**
 * Cache-Miss-Lookup des Detail-Crawls: aktive Inserate des Stichtags (=
 * heutiger Sweep) mit URL, aber ohne inserat_details-Zeile. Delistete fallen
 * am Folgetag aus dem Filter — ein dauerhaft fehlschlagender Fetch (404)
 * wird so nie endlos wiederholt.
 */
export async function detailsFehlen(
  bundesland: string,
  stichtag: string,
): Promise<DetailKandidat[]> {
  const { rows } = await holePool().query<{ portal: string; inserat_id: string; url: string }>(
    `SELECT b.portal, b.inserat_id, b.url
     FROM inserate_bestand b
     LEFT JOIN inserat_details d USING (portal, inserat_id)
     WHERE d.portal IS NULL
       AND b.bundesland = $1 AND b.zuletzt_gesehen = $2 AND b.url IS NOT NULL
     ORDER BY b.portal, b.inserat_id`,
    [bundesland, stichtag],
  );
  return rows.map((z) => ({ portal: z.portal, inseratId: z.inserat_id, url: z.url }));
}
