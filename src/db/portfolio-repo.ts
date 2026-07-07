import { holePool } from './client.js';

/**
 * Persistenz des eigenen Portfolios (manuell gepflegte Wohnungen) —
 * unabhängig vom Crawl, simples CRUD.
 */

export interface PortfolioObjekt {
  id: number;
  bezeichnung: string;
  plz: string;
  ort: string;
  kaufpreis: number;
  kaufdatum?: string; // YYYY-MM-DD
  /** Aktuelle Kaltmiete pro Monat; undefined = leerstehend. */
  mieteMonat?: number;
  flaecheM2: number;
  zimmer: number;
  baujahr?: number;
  erstelltAm: Date;
  aktualisiertAm: Date;
}

/** Eingabedaten (ohne id/Zeitstempel) — aus parsePortfolioForm. */
export type PortfolioEingabe = Omit<PortfolioObjekt, 'id' | 'erstelltAm' | 'aktualisiertAm'>;

interface PortfolioZeile {
  id: number;
  bezeichnung: string;
  plz: string;
  ort: string;
  kaufpreis: number;
  kaufdatum: string | null;
  miete_monat: number | null;
  flaeche_m2: number;
  zimmer: number;
  baujahr: number | null;
  erstellt_am: Date;
  aktualisiert_am: Date;
}

function ausZeile(z: PortfolioZeile): PortfolioObjekt {
  const objekt: PortfolioObjekt = {
    id: z.id,
    bezeichnung: z.bezeichnung,
    plz: z.plz,
    ort: z.ort,
    kaufpreis: z.kaufpreis,
    flaecheM2: z.flaeche_m2,
    zimmer: z.zimmer,
    erstelltAm: z.erstellt_am,
    aktualisiertAm: z.aktualisiert_am,
  };
  if (z.kaufdatum !== null) objekt.kaufdatum = z.kaufdatum;
  if (z.miete_monat !== null) objekt.mieteMonat = z.miete_monat;
  if (z.baujahr !== null) objekt.baujahr = z.baujahr;
  return objekt;
}

const SPALTEN = `id, bezeichnung, plz, ort, kaufpreis, kaufdatum::text AS kaufdatum,
  miete_monat, flaeche_m2, zimmer, baujahr, erstellt_am, aktualisiert_am`;

export async function portfolioAnlegen(eingabe: PortfolioEingabe): Promise<number> {
  const { rows } = await holePool().query<{ id: number }>(
    `INSERT INTO portfolio_objekte
       (bezeichnung, plz, ort, kaufpreis, kaufdatum, miete_monat, flaeche_m2, zimmer, baujahr)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      eingabe.bezeichnung,
      eingabe.plz,
      eingabe.ort,
      eingabe.kaufpreis,
      eingabe.kaufdatum ?? null,
      eingabe.mieteMonat ?? null,
      eingabe.flaecheM2,
      eingabe.zimmer,
      eingabe.baujahr ?? null,
    ],
  );
  return rows[0]!.id;
}

export async function portfolioAktualisieren(id: number, eingabe: PortfolioEingabe): Promise<void> {
  await holePool().query(
    `UPDATE portfolio_objekte
     SET bezeichnung = $2, plz = $3, ort = $4, kaufpreis = $5, kaufdatum = $6,
         miete_monat = $7, flaeche_m2 = $8, zimmer = $9, baujahr = $10,
         aktualisiert_am = now()
     WHERE id = $1`,
    [
      id,
      eingabe.bezeichnung,
      eingabe.plz,
      eingabe.ort,
      eingabe.kaufpreis,
      eingabe.kaufdatum ?? null,
      eingabe.mieteMonat ?? null,
      eingabe.flaecheM2,
      eingabe.zimmer,
      eingabe.baujahr ?? null,
    ],
  );
}

export async function portfolioLaden(id: number): Promise<PortfolioObjekt | undefined> {
  const { rows } = await holePool().query<PortfolioZeile>(
    `SELECT ${SPALTEN} FROM portfolio_objekte WHERE id = $1`,
    [id],
  );
  return rows[0] ? ausZeile(rows[0]) : undefined;
}

export async function portfolioAuflisten(): Promise<PortfolioObjekt[]> {
  const { rows } = await holePool().query<PortfolioZeile>(
    `SELECT ${SPALTEN} FROM portfolio_objekte ORDER BY bezeichnung, id`,
  );
  return rows.map(ausZeile);
}

export async function portfolioLoeschen(id: number): Promise<void> {
  await holePool().query('DELETE FROM portfolio_objekte WHERE id = $1', [id]);
}
