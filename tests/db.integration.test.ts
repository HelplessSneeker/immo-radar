import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holePool, schliessePool } from '../src/db/client.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import {
  inserateLaden,
  sucheAbschliessen,
  sucheAnlegen,
  sucheFehlgeschlagen,
  sucheLaden,
  suchenAuflisten,
  zombieSuchenBereinigen,
} from '../src/db/suchen-repo.js';
import type { SuchKriterien } from '../src/search.js';
import type { Inserat } from '../src/types.js';

/**
 * Integrationstests gegen ein echtes Postgres – laufen nur, wenn DATABASE_URL
 * gesetzt ist (z. B. via `pnpm db:up` + .env). `pnpm test` bleibt ohne DB grün.
 */

const KRITERIEN: SuchKriterien = {
  bundesland: 'kaernten',
  typ: 'kauf',
  preisMin: 100000,
  ort: 'Villach',
};

const INSERAT: Inserat = {
  id: 'WH-1',
  typ: 'kauf',
  ort: 'Villach',
  plz: '9500',
  bezirk: 'Villach Stadt',
  preis: 200000,
  flaeche_m2: 60,
  zimmer: 3,
  baujahr: 1995,
  zustand: 'saniert',
  url: 'https://example.at/wh-1',
  datum_erfasst: '2026-07-02',
};

describe.runIf(!!process.env.DATABASE_URL)('suchen-repo (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query('TRUNCATE suchen RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await schliessePool();
  });

  it('anlegen → abschliessen → laden ergibt die gespeicherten Daten zurück', async () => {
    const id = await sucheAnlegen(KRITERIEN);

    let suche = await sucheLaden(id);
    expect(suche?.status).toBe('laufend');
    expect(suche?.kriterien).toEqual(KRITERIEN);

    await sucheAbschliessen(id, ['quelle A'], [INSERAT, { ...INSERAT, id: 'WH-2' }]);

    suche = await sucheLaden(id);
    expect(suche?.status).toBe('fertig');
    expect(suche?.quellen).toEqual(['quelle A']);
    expect(suche?.treffer).toBe(2);
    expect(suche?.beendetAm).toBeInstanceOf(Date);

    const inserate = await inserateLaden(id);
    expect(inserate).toEqual([INSERAT, { ...INSERAT, id: 'WH-2' }]);
  });

  it('markiert eine Suche als fehlgeschlagen, ohne fertige Suchen anzufassen', async () => {
    const fertige = await sucheAnlegen(KRITERIEN);
    await sucheAbschliessen(fertige, [], []);
    const id = await sucheAnlegen(KRITERIEN);

    await sucheFehlgeschlagen(id, 'Timeout');
    await sucheFehlgeschlagen(fertige, 'darf nicht wirken');

    expect((await sucheLaden(id))?.fehler).toBe('Timeout');
    expect((await sucheLaden(fertige))?.status).toBe('fertig');
  });

  it('listet Suchen neueste zuerst und respektiert das Limit', async () => {
    const a = await sucheAnlegen(KRITERIEN);
    const b = await sucheAnlegen({ bundesland: 'wien', typ: 'beide' });

    const alle = await suchenAuflisten();
    expect(alle.map((s) => s.id)).toEqual([b, a]);
    expect(await suchenAuflisten(1)).toHaveLength(1);
  });

  it('räumt laufende Zombie-Suchen beim Start ab', async () => {
    const laufend = await sucheAnlegen(KRITERIEN);
    const fertig = await sucheAnlegen(KRITERIEN);
    await sucheAbschliessen(fertig, [], []);

    expect(await zombieSuchenBereinigen()).toBe(1);
    const suche = await sucheLaden(laufend);
    expect(suche?.status).toBe('fehlgeschlagen');
    expect(suche?.fehler).toContain('neu gestartet');
    expect((await sucheLaden(fertig))?.status).toBe('fertig');
  });

  it('verhindert doppelte Portal-IDs innerhalb einer Suche (UNIQUE)', async () => {
    const id = await sucheAnlegen(KRITERIEN);
    await expect(sucheAbschliessen(id, [], [INSERAT, INSERAT])).rejects.toThrow(/duplicate key/);
    // Transaktion zurückgerollt: Suche bleibt laufend, keine Inserate gespeichert
    expect((await sucheLaden(id))?.status).toBe('laufend');
    expect(await inserateLaden(id)).toEqual([]);
  });
});
