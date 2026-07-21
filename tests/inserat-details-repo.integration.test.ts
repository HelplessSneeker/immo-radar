import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bestandUpsert } from '../src/db/bestand-repo.js';
import { holePool, schliessePool } from '../src/db/client.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import {
  detailsFehlen,
  detailsLaden,
  detailUpsert,
} from '../src/db/inserat-details-repo.js';
import type { InseratDetail, InseratMitPortal } from '../src/types.js';

/**
 * Integrationstests des Detail-Caches (inserat_details) — laufen nur mit
 * DATABASE_URL (gegen immo_test).
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
    url: `https://portal.example/${id}`,
    datum_erfasst: '2026-07-01',
    ...overrides,
  };
}

const DETAIL: InseratDetail = {
  baujahr: 1990,
  zustand: 'sehr gut',
  baustil: 'Altbau',
  heizung: 'Fernwärme',
  ausstattung: ['Balkon', 'Lift'],
  energieHwb: 48.3,
  energieFgee: 0.8,
  beschreibung: 'Helle Wohnung.',
};

describe.runIf(!!process.env.DATABASE_URL)('inserat-details-repo (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query('TRUNCATE inserate_bestand RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await schliessePool();
  });

  it('upsertet Details und liest sie inklusive ausstattung-Array zurück', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-07-01');
    await detailUpsert('willhaben.at', 'wh-1', DETAIL);

    const details = await detailsLaden('kaernten');
    expect(details).toHaveLength(1);
    const d = details[0]!;
    expect(d.portal).toBe('willhaben.at');
    expect(d.inseratId).toBe('wh-1');
    expect(d.baujahr).toBe(1990);
    expect(d.zustand).toBe('sehr gut');
    expect(d.ausstattung).toEqual(['Balkon', 'Lift']); // jsonb-Round-Trip
    expect(d.energieHwb).toBe(48.3);
    expect(d.detailGeholtAm.length).toBeGreaterThan(0);

    // Idempotent: erneuter Upsert überschreibt statt zu duplizieren.
    await detailUpsert('willhaben.at', 'wh-1', { baujahr: 1991 });
    const erneut = await detailsLaden('kaernten');
    expect(erneut).toHaveLength(1);
    expect(erneut[0]!.baujahr).toBe(1991);
    expect(erneut[0]!.ausstattung).toBeUndefined(); // Vollersatz, kein Merge
  });

  it('detailsFehlen liefert nur Stichtag-aktive Inserate mit URL und ohne Details', async () => {
    await bestandUpsert(
      [
        inserat('wh-offen', 'willhaben.at'),
        inserat('wh-hat-details', 'willhaben.at'),
        inserat('wh-ohne-url', 'willhaben.at', { url: undefined }),
      ],
      'kaernten',
      '2026-07-02',
    );
    // Gestern zuletzt gesehen ⇒ nicht mehr aktiv ⇒ kein Kandidat.
    await bestandUpsert([inserat('wh-alt', 'willhaben.at')], 'kaernten', '2026-07-01');
    await detailUpsert('willhaben.at', 'wh-hat-details', DETAIL);

    const kandidaten = await detailsFehlen('kaernten', '2026-07-02');
    expect(kandidaten).toEqual([
      {
        portal: 'willhaben.at',
        inseratId: 'wh-offen',
        url: 'https://portal.example/wh-offen',
      },
    ]);
  });

  it('nach dem Upsert verschwindet der Kandidat (Cache-Beweis auf DB-Ebene)', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-07-02');
    expect(await detailsFehlen('kaernten', '2026-07-02')).toHaveLength(1);

    await detailUpsert('willhaben.at', 'wh-1', {});
    expect(await detailsFehlen('kaernten', '2026-07-02')).toHaveLength(0);
  });

  it('kaskadiert beim Löschen des Bestands und verweigert Details ohne Bestand', async () => {
    await bestandUpsert([inserat('wh-1', 'willhaben.at')], 'kaernten', '2026-07-01');
    await detailUpsert('willhaben.at', 'wh-1', DETAIL);

    await holePool().query('DELETE FROM inserate_bestand');
    const { rows } = await holePool().query('SELECT count(*)::int AS n FROM inserat_details');
    expect(rows[0]).toEqual({ n: 0 });

    await expect(detailUpsert('willhaben.at', 'wh-gibts-nicht', DETAIL)).rejects.toThrow();
  });
});
