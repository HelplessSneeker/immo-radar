import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bestandUpsert } from '../src/db/bestand-repo.js';
import { holePool, schliessePool } from '../src/db/client.js';
import { detailUpsert } from '../src/db/inserat-details-repo.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import { objekteRebuild, objekteZuordnungsLauf } from '../src/db/objekte-repo.js';
import type { InseratMitPortal } from '../src/types.js';

/**
 * Integrationstests der Dedup-Persistenz (objekte, objekt_id, Audit-Log) –
 * laufen nur mit DATABASE_URL (gegen immo_test).
 */

function inserat(
  id: string,
  portal: string,
  overrides: Partial<InseratMitPortal> = {},
): InseratMitPortal {
  return {
    id,
    portal,
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: 200000,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-07-01',
    ...overrides,
  };
}

async function objektIdVon(portal: string, inseratId: string): Promise<number | null> {
  const { rows } = await holePool().query<{ objekt_id: number | null }>(
    'SELECT objekt_id FROM inserate_bestand WHERE portal = $1 AND inserat_id = $2',
    [portal, inseratId],
  );
  return rows[0]!.objekt_id;
}

describe.runIf(!!process.env.DATABASE_URL)('objekte-repo (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query(
      'TRUNCATE inserate_bestand, objekte, objekt_zuordnungen RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await schliessePool();
  });

  it('ordnet Cross-Portal-Duplikate demselben Objekt zu und schreibt das Audit-Log', async () => {
    await bestandUpsert(
      [inserat('wh-1', 'willhaben.at'), inserat('is24-1', 'immoscout24.at', { preis: 202000 })],
      'kaernten',
      '2026-07-01',
    );

    const ergebnis = await objekteZuordnungsLauf('kaernten');
    expect(ergebnis).toEqual({ neueObjekte: 1, zugeordnet: 2 });

    const whObjekt = await objektIdVon('willhaben.at', 'wh-1');
    expect(whObjekt).not.toBeNull();
    expect(await objektIdVon('immoscout24.at', 'is24-1')).toBe(whObjekt);

    const { rows: audit } = await holePool().query<{ regel: string; aktion: string }>(
      'SELECT regel, aktion FROM objekt_zuordnungen ORDER BY id',
    );
    expect(audit).toEqual([
      { regel: 'neu', aktion: 'zugeordnet' },
      { regel: 'duplikat', aktion: 'zugeordnet' },
    ]);
  });

  it('Detail-Baujahr fließt via COALESCE in den Objekt-Kanon (objekte.baujahr)', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-07-01');
    await detailUpsert('willhaben.at', 'wh-1', { baujahr: 1990 });

    await objekteZuordnungsLauf('kaernten');
    const { rows } = await holePool().query<{ baujahr: number | null }>(
      'SELECT baujahr FROM objekte',
    );
    expect(rows).toEqual([{ baujahr: 1990 }]);
  });

  it('Detail-Baujahre wirken als Match-Guard: weit auseinander ⇒ zwei Objekte', async () => {
    await bestandUpsert(
      [inserat('wh-1', 'willhaben.at'), inserat('is24-1', 'immoscout24.at')],
      'kaernten',
      '2026-07-01',
    );
    await detailUpsert('willhaben.at', 'wh-1', { baujahr: 1970 });
    await detailUpsert('immoscout24.at', 'is24-1', { baujahr: 2020 });

    const ergebnis = await objekteZuordnungsLauf('kaernten');
    expect(ergebnis.neueObjekte).toBe(2);
  });

  it('ist idempotent: ein zweiter Lauf ohne neue Inserate schreibt nichts', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-07-01');
    await objekteZuordnungsLauf('kaernten');

    const zweiter = await objekteZuordnungsLauf('kaernten');
    expect(zweiter).toEqual({ neueObjekte: 0, zugeordnet: 0 });
    const { rows } = await holePool().query('SELECT count(*)::int AS n FROM objekt_zuordnungen');
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('der Inkrement-Lauf hängt eine Wiedereinstellung ans bestehende Objekt', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-06-01');
    await objekteZuordnungsLauf('kaernten');
    const objektId = await objektIdVon('willhaben.at', 'wh-1');

    // Neues Inserat, zeitlich nach wh-1 (zuletzt_gesehen 2026-06-01).
    await bestandUpsert(
      [inserat('wh-2', 'willhaben.at', { datum_erfasst: '2026-07-01' })],
      'kaernten',
      '2026-07-01',
    );
    const ergebnis = await objekteZuordnungsLauf('kaernten');
    expect(ergebnis).toEqual({ neueObjekte: 0, zugeordnet: 1 });
    expect(await objektIdVon('willhaben.at', 'wh-2')).toBe(objektId);

    const { rows } = await holePool().query<{ regel: string }>(
      "SELECT regel FROM objekt_zuordnungen WHERE inserat_id = 'wh-2'",
    );
    expect(rows[0]).toEqual({ regel: 'relisting' });
  });

  it('der Rebuild leert die Schicht und ordnet neu zu (eine Transaktion)', async () => {
    await bestandUpsert(
      [inserat('wh-1', 'willhaben.at'), inserat('is24-1', 'immoscout24.at')],
      'kaernten',
      '2026-07-01',
    );
    await objekteZuordnungsLauf('kaernten');
    const vorher = await objektIdVon('willhaben.at', 'wh-1');

    const ergebnis = await objekteRebuild('kaernten');
    expect(ergebnis).toEqual({ neueObjekte: 1, zugeordnet: 2 });
    const nachher = await objektIdVon('willhaben.at', 'wh-1');
    expect(nachher).not.toBeNull();
    expect(nachher).not.toBe(vorher); // neue Objekt-Identität nach Rebuild

    // Audit bleibt vollständig: 2 Erst-Zuordnungen + 2 Rebuild-Zuordnungen.
    const { rows } = await holePool().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM objekt_zuordnungen WHERE details->>'rebuild' = 'true'",
    );
    expect(rows[0]!.n).toBe(2);
  });

  it('Objekt-Löschung setzt objekt_id per ON DELETE SET NULL zurück', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-07-01');
    await objekteZuordnungsLauf('kaernten');

    await holePool().query('DELETE FROM objekte');
    expect(await objektIdVon('willhaben.at', 'wh-1')).toBeNull();
  });
});
