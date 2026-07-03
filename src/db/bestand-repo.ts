import type { Inserat, InseratMitPortal, InseratTyp } from '../types.js';
import { holePool } from './client.js';

/**
 * Globaler historisierter Inseratsbestand: eine Zeile pro Portal-Inserat,
 * über Crawls hinweg fortgeschrieben, plus Preisverlauf.
 */

export interface BestandInserat extends Inserat {
  portal: string;
  zuerstGesehen: string; // YYYY-MM-DD
  zuletztGesehen: string;
}

export interface PreisPunkt {
  portal: string;
  inseratId: string;
  preis: number;
  erfasstAm: string; // YYYY-MM-DD
}

export interface BestandZeile {
  portal: string;
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
  datum_erfasst: string; // alle Datums-Spalten als ::text selektiert
  zuerst_gesehen: string;
  zuletzt_gesehen: string;
}

export interface PreisPunktZeile {
  portal: string;
  inserat_id: string;
  preis: number;
  erfasst_am: string;
}

export function bestandInseratAusZeile(z: BestandZeile): BestandInserat {
  const inserat: BestandInserat = {
    id: z.inserat_id,
    portal: z.portal,
    typ: z.typ,
    ort: z.ort,
    plz: z.plz,
    bezirk: z.bezirk,
    preis: z.preis,
    flaeche_m2: z.flaeche_m2,
    zimmer: z.zimmer,
    datum_erfasst: z.datum_erfasst,
    zuerstGesehen: z.zuerst_gesehen,
    zuletztGesehen: z.zuletzt_gesehen,
  };
  if (z.baujahr !== null) inserat.baujahr = z.baujahr;
  if (z.zustand !== null) inserat.zustand = z.zustand;
  if (z.url !== null) inserat.url = z.url;
  return inserat;
}

export function preisPunktAusZeile(z: PreisPunktZeile): PreisPunkt {
  return { portal: z.portal, inseratId: z.inserat_id, preis: z.preis, erfasstAm: z.erfasst_am };
}

/**
 * Schreibt einen Crawl in den Bestand: neue Inserate werden angelegt (samt
 * erster Preis-Historien-Zeile), bekannte fortgeschrieben (zuletzt_gesehen,
 * aktueller Preis; bei Preisänderung eine Historien-Zeile — max. eine pro
 * Tag, der letzte Preis des Tages gewinnt). zuerst_gesehen bleibt stabil.
 */
export async function bestandUpsert(
  inserate: InseratMitPortal[],
  bundesland: string,
  gesehenAm: string,
): Promise<{ neu: number; preisAenderungen: number }> {
  const client = await holePool().connect();
  let neu = 0;
  let preisAenderungen = 0;
  try {
    await client.query('BEGIN');
    for (const i of inserate) {
      const { rows } = await client.query<{ preis_vorher: number | null }>(
        `WITH vorher AS (
           SELECT preis FROM inserate_bestand WHERE portal = $1 AND inserat_id = $2
         )
         INSERT INTO inserate_bestand
           (portal, inserat_id, typ, bundesland, ort, plz, bezirk, preis, flaeche_m2,
            zimmer, baujahr, zustand, url, datum_erfasst, zuerst_gesehen, zuletzt_gesehen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
         ON CONFLICT (portal, inserat_id) DO UPDATE SET
           preis = EXCLUDED.preis, ort = EXCLUDED.ort, plz = EXCLUDED.plz,
           bezirk = EXCLUDED.bezirk, zustand = EXCLUDED.zustand, url = EXCLUDED.url,
           bundesland = EXCLUDED.bundesland,
           zuletzt_gesehen = GREATEST(inserate_bestand.zuletzt_gesehen, EXCLUDED.zuletzt_gesehen)
         RETURNING (SELECT preis FROM vorher) AS preis_vorher`,
        [
          i.portal,
          i.id,
          i.typ,
          bundesland,
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
          gesehenAm,
        ],
      );
      const preisVorher = rows[0]!.preis_vorher;
      if (preisVorher === null) neu += 1;
      else if (preisVorher !== i.preis) preisAenderungen += 1;
      if (preisVorher === null || preisVorher !== i.preis) {
        await client.query(
          `INSERT INTO preis_historie (portal, inserat_id, preis, erfasst_am)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (portal, inserat_id, erfasst_am) DO UPDATE SET preis = EXCLUDED.preis`,
          [i.portal, i.id, i.preis, gesehenAm],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { neu, preisAenderungen };
}

export async function bestandLaden(bundesland: string): Promise<BestandInserat[]> {
  const { rows } = await holePool().query<BestandZeile>(
    `SELECT portal, inserat_id, typ, ort, plz, bezirk, preis, flaeche_m2, zimmer,
            baujahr, zustand, url, datum_erfasst::text AS datum_erfasst,
            zuerst_gesehen::text AS zuerst_gesehen, zuletzt_gesehen::text AS zuletzt_gesehen
     FROM inserate_bestand WHERE bundesland = $1 ORDER BY portal, inserat_id`,
    [bundesland],
  );
  return rows.map(bestandInseratAusZeile);
}

export async function preisHistorieLaden(bundesland: string): Promise<PreisPunkt[]> {
  const { rows } = await holePool().query<PreisPunktZeile>(
    `SELECT h.portal, h.inserat_id, h.preis, h.erfasst_am::text AS erfasst_am
     FROM preis_historie h
     JOIN inserate_bestand b USING (portal, inserat_id)
     WHERE b.bundesland = $1
     ORDER BY h.erfasst_am, h.portal, h.inserat_id`,
    [bundesland],
  );
  return rows.map(preisPunktAusZeile);
}
