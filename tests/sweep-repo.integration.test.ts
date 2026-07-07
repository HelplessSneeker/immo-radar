import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holePool, schliessePool } from '../src/db/client.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import {
  fertigeSegmente,
  laufenderSweep,
  letzterFertigerSweep,
  segmentAbschliessen,
  segmentBeanspruchen,
  segmentFehlgeschlagen,
  segmentSchluessel,
  segmenteFuerDatum,
  sweepAbschliessen,
  sweepBeanspruchen,
  sweepFehlgeschlagen,
  sweepLaeufeAuflisten,
  zombieSweepsBereinigen,
} from '../src/db/sweep-repo.js';

/**
 * Integrationstests für den Sweep-Claim und die Segment-Persistenz – laufen
 * nur mit DATABASE_URL (gegen immo_test, siehe db.integration.test.ts).
 */

const DATUM = '2026-07-07';

describe.runIf(!!process.env.DATABASE_URL)('sweep-repo (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query('TRUNCATE sweep_laeufe, sweep_segmente RESTART IDENTITY');
  });

  afterAll(async () => {
    await schliessePool();
  });

  describe('sweepBeanspruchen', () => {
    it('beansprucht den Tag genau einmal; laufend/fertig blockiert', async () => {
      const erste = await sweepBeanspruchen(DATUM);
      expect(erste).toBeDefined();
      // Läuft gerade ⇒ kein zweiter Claim.
      expect(await sweepBeanspruchen(DATUM)).toBeUndefined();

      await sweepAbschliessen(erste!, 42);
      // Fertig ⇒ auch kein Claim mehr.
      expect(await sweepBeanspruchen(DATUM)).toBeUndefined();
      // Ein anderer Tag ist unabhängig.
      expect(await sweepBeanspruchen('2026-07-08')).toBeDefined();
    });

    it('ein fehlgeschlagener Lauf ist erneut beanspruchbar (Retry)', async () => {
      const erste = await sweepBeanspruchen(DATUM);
      await sweepFehlgeschlagen(erste!, 'Portale down');

      const zweite = await sweepBeanspruchen(DATUM);
      expect(zweite).toBe(erste); // gleiche Zeile, zurückgesetzt
      const [lauf] = await sweepLaeufeAuflisten(1);
      expect(lauf).toMatchObject({ status: 'laufend', laufDatum: DATUM });
      expect(lauf!.fehler).toBeUndefined();
    });
  });

  describe('Segmente', () => {
    const KEY = { portal: 'willhaben.at', bezirk: 'klagenfurt-stadt', typ: 'kauf' as const };

    it('fertige Segmente bleiben beim Retry-Lauf erhalten (Resume)', async () => {
      const lauf = await sweepBeanspruchen(DATUM);
      const segment = await segmentBeanspruchen(DATUM, KEY);
      await segmentAbschliessen(segment!, 'quelle', 120, 120);
      await sweepFehlgeschlagen(lauf!, 'später gescheitert');

      // Retry desselben Tages: das fertige Segment ist im Skip-Set …
      await sweepBeanspruchen(DATUM);
      const fertige = await fertigeSegmente(DATUM);
      expect(fertige.has(segmentSchluessel(KEY))).toBe(true);
      // … und nicht erneut beanspruchbar.
      expect(await segmentBeanspruchen(DATUM, KEY)).toBeUndefined();
    });

    it('fehlgeschlagene Segmente sind erneut beanspruchbar', async () => {
      await sweepBeanspruchen(DATUM);
      const erste = await segmentBeanspruchen(DATUM, KEY);
      await segmentFehlgeschlagen(erste!, 'Timeout');

      const zweite = await segmentBeanspruchen(DATUM, KEY);
      expect(zweite).toBe(erste);
      expect(await fertigeSegmente(DATUM)).toEqual(new Set());
    });

    it('Preisbänder sind eigene Segmente, das ungebänderte ist davon getrennt', async () => {
      await sweepBeanspruchen(DATUM);
      const ganz = await segmentBeanspruchen(DATUM, KEY);
      const band = await segmentBeanspruchen(DATUM, { ...KEY, preisMin: 150000, preisMax: 250000 });
      expect(band).not.toBe(ganz);
      await segmentAbschliessen(band!, 'band', 30, 30);

      const fertige = await fertigeSegmente(DATUM);
      expect(fertige.has(segmentSchluessel({ ...KEY, preisMin: 150000, preisMax: 250000 }))).toBe(true);
      expect(fertige.has(segmentSchluessel(KEY))).toBe(false);

      const segmente = await segmenteFuerDatum(DATUM);
      expect(segmente).toHaveLength(2);
      expect(segmente[1]).toMatchObject({ preisMin: 150000, preisMax: 250000, status: 'fertig' });
    });
  });

  describe('letzterFertigerSweep / laufenderSweep', () => {
    it('liefert den jüngsten fertigen Lauf und den gerade laufenden', async () => {
      expect(await letzterFertigerSweep()).toBeUndefined();
      const alt = await sweepBeanspruchen('2026-07-05');
      await sweepAbschliessen(alt!, 10);
      const neu = await sweepBeanspruchen(DATUM);

      expect((await letzterFertigerSweep())?.laufDatum).toBe('2026-07-05');
      expect((await laufenderSweep())?.laufDatum).toBe(DATUM);

      await sweepAbschliessen(neu!, 20);
      expect((await letzterFertigerSweep())?.laufDatum).toBe(DATUM);
      expect(await laufenderSweep()).toBeUndefined();
    });
  });

  describe('zombieSweepsBereinigen', () => {
    it('markiert hängengebliebene Läufe und Segmente als fehlgeschlagen', async () => {
      await sweepBeanspruchen(DATUM);
      await segmentBeanspruchen(DATUM, { portal: 'willhaben.at', bezirk: 'gesamt', typ: 'miete' });

      expect(await zombieSweepsBereinigen()).toBe(1);
      const [lauf] = await sweepLaeufeAuflisten(1);
      expect(lauf!.status).toBe('fehlgeschlagen');
      const [segment] = await segmenteFuerDatum(DATUM);
      expect(segment!.status).toBe('fehlgeschlagen');
      // Danach ist der Tag wieder beanspruchbar (Retry beim nächsten Tick).
      expect(await sweepBeanspruchen(DATUM)).toBeDefined();
    });
  });
});
