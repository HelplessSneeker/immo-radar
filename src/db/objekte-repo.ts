import type { PoolClient } from 'pg';
import { ordneZu, type MatchInserat, type ObjektGruppe } from '../matching.js';
import {
  bestandInseratAusZeile,
  preisPunktAusZeile,
  type BestandZeile,
  type PreisPunkt,
  type PreisPunktZeile,
} from './bestand-repo.js';
import { holePool } from './client.js';

/**
 * Persistenz der Dedup-Schicht: objekte + objekt_id-Zuordnung am Bestand +
 * Audit-Log. Die Matching-Logik selbst ist pure (src/matching.ts) — hier
 * wird nur geladen, geschrieben und der Rebuild orchestriert.
 */

export interface ZuordnungsErgebnis {
  neueObjekte: number;
  zugeordnet: number;
}

interface BestandZeileMitObjekt extends BestandZeile {
  objekt_id: number | null;
}

function matchInseratAusZeile(z: BestandZeileMitObjekt): MatchInserat {
  const inserat: MatchInserat = bestandInseratAusZeile(z);
  if (z.objekt_id !== null) inserat.objektId = z.objekt_id;
  return inserat;
}

async function bestandMitObjektLaden(
  client: PoolClient,
  bundesland: string,
): Promise<MatchInserat[]> {
  const { rows } = await client.query<BestandZeileMitObjekt>(
    `SELECT b.portal, b.inserat_id, b.typ, b.ort, b.plz, b.bezirk, b.preis, b.flaeche_m2, b.zimmer,
            COALESCE(b.baujahr, d.baujahr) AS baujahr, COALESCE(b.zustand, d.zustand) AS zustand,
            b.url, b.datum_erfasst::text AS datum_erfasst,
            b.zuerst_gesehen::text AS zuerst_gesehen, b.zuletzt_gesehen::text AS zuletzt_gesehen,
            b.datenqualitaet, b.objekt_id
     FROM inserate_bestand b
     LEFT JOIN inserat_details d USING (portal, inserat_id)
     WHERE b.bundesland = $1 ORDER BY b.portal, b.inserat_id`,
    [bundesland],
  );
  return rows.map(matchInseratAusZeile);
}

/**
 * Bestand samt objekt_id plus komplette Preishistorie eines Bundeslands —
 * die Datenbasis für objekteAusBestand/berechneObjektTrend (Dashboard).
 */
export async function objektBestandLaden(
  bundesland: string,
): Promise<{ bestand: MatchInserat[]; historie: PreisPunkt[] }> {
  const pool = holePool();
  const [bestandErgebnis, historieErgebnis] = await Promise.all([
    pool.query<BestandZeileMitObjekt>(
      `SELECT b.portal, b.inserat_id, b.typ, b.ort, b.plz, b.bezirk, b.preis, b.flaeche_m2, b.zimmer,
              COALESCE(b.baujahr, d.baujahr) AS baujahr, COALESCE(b.zustand, d.zustand) AS zustand,
              b.url, b.datum_erfasst::text AS datum_erfasst,
              b.zuerst_gesehen::text AS zuerst_gesehen, b.zuletzt_gesehen::text AS zuletzt_gesehen,
              b.datenqualitaet, b.objekt_id
       FROM inserate_bestand b
       LEFT JOIN inserat_details d USING (portal, inserat_id)
       WHERE b.bundesland = $1 ORDER BY b.portal, b.inserat_id`,
      [bundesland],
    ),
    pool.query<PreisPunktZeile>(
      `SELECT h.portal, h.inserat_id, h.preis, h.erfasst_am::text AS erfasst_am
       FROM preis_historie h
       JOIN inserate_bestand b USING (portal, inserat_id)
       WHERE b.bundesland = $1
       ORDER BY h.erfasst_am, h.portal, h.inserat_id`,
      [bundesland],
    ),
  ]);
  return {
    bestand: bestandErgebnis.rows.map(matchInseratAusZeile),
    historie: historieErgebnis.rows.map(preisPunktAusZeile),
  };
}

/** Schreibt die neuen Zuordnungen einer Partition (Gruppen aus ordneZu). */
async function schreibeGruppen(
  client: PoolClient,
  gruppen: ObjektGruppe[],
  rebuild: boolean,
): Promise<ZuordnungsErgebnis> {
  let neueObjekte = 0;
  let zugeordnet = 0;
  for (const gruppe of gruppen) {
    const neueMitglieder = gruppe.mitglieder.filter((m) => m.regel !== 'bestehend');
    if (neueMitglieder.length === 0) continue;

    let objektId = gruppe.objektId;
    if (objektId === undefined) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO objekte (typ, plz, ort, bezirk, flaeche_m2, zimmer, baujahr)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          gruppe.kanon.typ,
          gruppe.kanon.plz,
          gruppe.kanon.ort,
          gruppe.kanon.bezirk,
          gruppe.kanon.flaecheM2,
          gruppe.kanon.zimmer,
          gruppe.kanon.baujahr ?? null,
        ],
      );
      objektId = rows[0]!.id;
      neueObjekte += 1;
    }

    for (const mitglied of neueMitglieder) {
      await client.query(
        `UPDATE inserate_bestand SET objekt_id = $3 WHERE portal = $1 AND inserat_id = $2`,
        [mitglied.inserat.portal, mitglied.inserat.id, objektId],
      );
      await client.query(
        `INSERT INTO objekt_zuordnungen (objekt_id, portal, inserat_id, aktion, regel, details)
         VALUES ($1, $2, $3, 'zugeordnet', $4, $5::jsonb)`,
        [
          objektId,
          mitglied.inserat.portal,
          mitglied.inserat.id,
          mitglied.regel,
          JSON.stringify({ ...mitglied.details, ...(rebuild && { rebuild: true }) }),
        ],
      );
      zugeordnet += 1;
    }
  }
  return { neueObjekte, zugeordnet };
}

/**
 * Der Inkrement-Lauf nach jedem Sweep: ordnet nur Inserate ohne objekt_id
 * zu; bestehende Zuordnungen bleiben unverändert (Regeländerungen rollt der
 * Rebuild aus).
 */
export async function objekteZuordnungsLauf(bundesland: string): Promise<ZuordnungsErgebnis> {
  const client = await holePool().connect();
  try {
    await client.query('BEGIN');
    const bestand = await bestandMitObjektLaden(client, bundesland);
    const ergebnis = await schreibeGruppen(client, ordneZu(bestand), false);
    await client.query('COMMIT');
    return ergebnis;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Rebuild: löscht alle Objekte (objekt_id wird per ON DELETE SET NULL
 * geleert) und partitioniert den ganzen Bestand deterministisch neu — so
 * werden Regeländerungen in src/matching.ts ausgerollt. Eine Transaktion;
 * das Audit-Log bleibt erhalten, neue Zeilen tragen details.rebuild=true.
 */
export async function objekteRebuild(bundesland: string): Promise<ZuordnungsErgebnis> {
  const client = await holePool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM objekte');
    const bestand = await bestandMitObjektLaden(client, bundesland);
    const ergebnis = await schreibeGruppen(client, ordneZu(bestand), true);
    await client.query('COMMIT');
    return ergebnis;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
