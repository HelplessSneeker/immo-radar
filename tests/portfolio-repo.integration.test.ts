import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holePool, schliessePool } from '../src/db/client.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import {
  portfolioAktualisieren,
  portfolioAnlegen,
  portfolioAuflisten,
  portfolioLaden,
  portfolioLoeschen,
  type PortfolioEingabe,
} from '../src/db/portfolio-repo.js';

/** CRUD-Roundtrip des Portfolios — läuft nur mit DATABASE_URL (immo_test). */

const EINGABE: PortfolioEingabe = {
  bezeichnung: 'Wohnung Villacher Straße',
  plz: '9020',
  ort: 'Klagenfurt',
  kaufpreis: 180000,
  kaufdatum: '2024-03-15',
  mieteMonat: 650,
  flaecheM2: 62,
  zimmer: 3,
  baujahr: 1992,
};

describe.runIf(!!process.env.DATABASE_URL)('portfolio-repo (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query('TRUNCATE portfolio_objekte RESTART IDENTITY');
  });

  afterAll(async () => {
    await schliessePool();
  });

  it('legt an, lädt und listet vollständig zurück', async () => {
    const id = await portfolioAnlegen(EINGABE);
    const geladen = await portfolioLaden(id);
    expect(geladen).toMatchObject({ id, ...EINGABE });

    const liste = await portfolioAuflisten();
    expect(liste).toHaveLength(1);
    expect(liste[0]!.erstelltAm).toBeInstanceOf(Date);
  });

  it('optionale Felder (Kaufdatum, Miete, Baujahr) sind wirklich optional', async () => {
    const id = await portfolioAnlegen({
      bezeichnung: 'Leerstand',
      plz: '9500',
      ort: 'Villach',
      kaufpreis: 150000,
      flaecheM2: 48,
      zimmer: 2,
    });
    const geladen = await portfolioLaden(id);
    expect(geladen!.mieteMonat).toBeUndefined();
    expect(geladen!.kaufdatum).toBeUndefined();
    expect(geladen!.baujahr).toBeUndefined();
  });

  it('aktualisiert Felder und stempelt aktualisiert_am neu', async () => {
    const id = await portfolioAnlegen(EINGABE);
    const vorher = (await portfolioLaden(id))!;
    await portfolioAktualisieren(id, { ...EINGABE, mieteMonat: 700, bezeichnung: 'Umbenannt' });
    const nachher = (await portfolioLaden(id))!;
    expect(nachher).toMatchObject({ mieteMonat: 700, bezeichnung: 'Umbenannt' });
    expect(nachher.aktualisiertAm.getTime()).toBeGreaterThanOrEqual(vorher.aktualisiertAm.getTime());
    expect(nachher.erstelltAm.getTime()).toBe(vorher.erstelltAm.getTime());
  });

  it('löscht endgültig', async () => {
    const id = await portfolioAnlegen(EINGABE);
    await portfolioLoeschen(id);
    expect(await portfolioLaden(id)).toBeUndefined();
    expect(await portfolioAuflisten()).toEqual([]);
  });
});
