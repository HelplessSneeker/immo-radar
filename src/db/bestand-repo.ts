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

/**
 * Aktiv-Stichtag je Portal (max(zuletzt_gesehen) je Bundesland UND Portal):
 * fällt ein Portal einen Tag aus, gelten seine Inserate nicht plötzlich als
 * delistet — jedes Portal wird an seinem eigenen letzten Crawl gemessen.
 */
export async function stichtagJePortal(bundesland: string): Promise<Map<string, string>> {
  const { rows } = await holePool().query<{ portal: string; stichtag: string }>(
    `SELECT portal, max(zuletzt_gesehen)::text AS stichtag
     FROM inserate_bestand WHERE bundesland = $1 GROUP BY portal`,
    [bundesland],
  );
  return new Map(rows.map((r) => [r.portal, r.stichtag]));
}

export interface InserateFilter {
  /** Bundesland-Slug; Aufrufer validiert gegen BUNDESLAENDER. */
  bundesland?: string;
  typ?: InseratTyp;
  /**
   * aktiv = beim jüngsten Crawl des eigenen Bundeslands UND Portals gesehen
   * (Stichtag = max(zuletzt_gesehen) je Bundesland und Portal, siehe
   * stichtagJePortal) – ein Portal-Ausfall „delistet" so nicht massenhaft.
   */
  status?: 'aktiv' | 'delistet';
  /** Teilstring, case-insensitiv über Ort, PLZ und Bezirk. */
  ort?: string;
}

export type InserateSortierung =
  | 'zuletzt_gesehen'
  | 'zuerst_gesehen'
  | 'preis'
  | 'eur_m2'
  | 'flaeche';

export interface BestandInseratMitLand extends BestandInserat {
  bundesland: string;
  /** Siehe Status-Regel in InserateFilter. */
  aktiv: boolean;
}

interface BestandZeileMitLand extends BestandZeile {
  bundesland: string;
  aktiv: boolean;
}

/**
 * ORDER-BY-Fragmente je Sortierung – Whitelist, damit nie Nutzereingaben ins
 * SQL interpoliert werden. Jeder Eintrag endet mit dem stabilen Tiebreaker
 * (portal, inserat_id), sonst dürfen LIMIT/OFFSET-Seiten Zeilen doppeln/schlucken.
 */
const SORTIERUNGEN: Record<InserateSortierung, string> = {
  zuletzt_gesehen: 'b.zuletzt_gesehen DESC, b.portal, b.inserat_id',
  zuerst_gesehen: 'b.zuerst_gesehen DESC, b.portal, b.inserat_id',
  preis: 'b.preis ASC, b.portal, b.inserat_id',
  eur_m2:
    'CASE WHEN b.flaeche_m2 > 0 THEN b.preis / b.flaeche_m2 END ASC NULLS LAST, b.portal, b.inserat_id',
  flaeche: 'b.flaeche_m2 DESC, b.portal, b.inserat_id',
};

/** LIKE/ILIKE-Sonderzeichen escapen, dann als Teilstring-Muster einrahmen. */
function ilikeMuster(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Eine Seite des globalen Bestands, SQL-seitig gefiltert, sortiert und
 * paginiert, plus Gesamtzahl der Treffer. Der Stichtag je Bundesland kommt
 * aus einer CTE; er liefert das aktiv/delistet-Flag jeder Zeile.
 */
export async function bestandSeiteLaden(
  filter: InserateFilter,
  sortierung: InserateSortierung,
  limit: number,
  offset: number,
): Promise<{ inserate: BestandInseratMitLand[]; gesamt: number }> {
  const bedingungen: string[] = [];
  const werte: unknown[] = [];
  const param = (wert: unknown): string => {
    werte.push(wert);
    return `$${werte.length}`;
  };
  if (filter.bundesland) bedingungen.push(`b.bundesland = ${param(filter.bundesland)}`);
  if (filter.typ) bedingungen.push(`b.typ = ${param(filter.typ)}`);
  if (filter.status) {
    bedingungen.push(
      filter.status === 'aktiv'
        ? 'b.zuletzt_gesehen >= s.stichtag'
        : 'b.zuletzt_gesehen < s.stichtag',
    );
  }
  if (filter.ort) {
    const muster = param(ilikeMuster(filter.ort));
    bedingungen.push(`(b.ort ILIKE ${muster} OR b.plz ILIKE ${muster} OR b.bezirk ILIKE ${muster})`);
  }
  const von = `FROM inserate_bestand b
     JOIN (SELECT bundesland, portal, max(zuletzt_gesehen) AS stichtag
           FROM inserate_bestand GROUP BY bundesland, portal) s USING (bundesland, portal)
     ${bedingungen.length > 0 ? `WHERE ${bedingungen.join(' AND ')}` : ''}`;
  // Ab hier teilen sich Count- und Seiten-Query die Filter-Parameter; nur die
  // Seiten-Query bekommt zusätzlich LIMIT/OFFSET.
  const filterWerte = [...werte];

  const pool = holePool();
  const [seiteErgebnis, gesamtErgebnis] = await Promise.all([
    pool.query<BestandZeileMitLand>(
      `SELECT b.portal, b.inserat_id, b.typ, b.bundesland, b.ort, b.plz, b.bezirk, b.preis,
              b.flaeche_m2, b.zimmer, b.baujahr, b.zustand, b.url,
              b.datum_erfasst::text AS datum_erfasst,
              b.zuerst_gesehen::text AS zuerst_gesehen, b.zuletzt_gesehen::text AS zuletzt_gesehen,
              (b.zuletzt_gesehen >= s.stichtag) AS aktiv
       ${von}
       ORDER BY ${SORTIERUNGEN[sortierung]}
       LIMIT ${param(limit)} OFFSET ${param(offset)}`,
      werte,
    ),
    pool.query<{ gesamt: number }>(`SELECT count(*)::int AS gesamt ${von}`, filterWerte),
  ]);
  return {
    inserate: seiteErgebnis.rows.map((z) => ({
      ...bestandInseratAusZeile(z),
      bundesland: z.bundesland,
      aktiv: z.aktiv,
    })),
    gesamt: gesamtErgebnis.rows[0]?.gesamt ?? 0,
  };
}

/**
 * Preishistorie nur der übergebenen Inserate (z. B. der 50 sichtbaren Zeilen
 * einer Bestand-Seite), gleiche Sortierung wie preisHistorieLaden – damit
 * letztePreisAenderungen() unverändert darauf arbeitet.
 */
export async function preisHistorieFuerInserate(
  inserate: ReadonlyArray<{ portal: string; id: string }>,
): Promise<PreisPunkt[]> {
  if (inserate.length === 0) return [];
  const { rows } = await holePool().query<PreisPunktZeile>(
    `SELECT portal, inserat_id, preis, erfasst_am::text AS erfasst_am
     FROM preis_historie
     WHERE (portal, inserat_id) IN (SELECT * FROM unnest($1::text[], $2::text[]))
     ORDER BY erfasst_am, portal, inserat_id`,
    [inserate.map((i) => i.portal), inserate.map((i) => i.id)],
  );
  return rows.map(preisPunktAusZeile);
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
