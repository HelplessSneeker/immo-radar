import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bestandLaden,
  bestandUpsert,
  preisHistorieLaden,
} from '../src/db/bestand-repo.js';
import { holePool, schliessePool } from '../src/db/client.js';
import {
  crawlLaeufeAuflisten,
  crawlLaufAbschliessen,
  crawlLaufBeanspruchen,
  crawlLaufErzwingen,
  crawlLaufFehlgeschlagen,
  gebietAktivieren,
  gebietAnlegen,
  gebietDeaktivieren,
  gebieteAuflisten,
  gebietLaden,
  letzteFertigeLaeufe,
  letzterFertigerLauf,
  zombieCrawlLaeufeBereinigen,
} from '../src/db/gebiete-repo.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import type { SuchKriterien } from '../src/search.js';
import type { InseratMitPortal } from '../src/types.js';

/**
 * Integrationstests für Beobachtungsgebiete und den historisierten Bestand –
 * laufen nur mit DATABASE_URL (siehe db.integration.test.ts).
 */

const KRITERIEN: SuchKriterien = { bundesland: 'kaernten', typ: 'beide', ort: 'Villach' };

function inserat(id: string, preis = 200000): InseratMitPortal {
  return {
    id,
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-07-01',
  };
}

describe.runIf(!!process.env.DATABASE_URL)('beobachtung (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query('TRUNCATE inserate_bestand, gebiete RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await schliessePool();
  });

  describe('bestand-repo', () => {
    it('legt neue Inserate mit erster Historien-Zeile an', async () => {
      const ergebnis = await bestandUpsert(
        [inserat('wh-1'), inserat('wh-2')],
        'kaernten',
        '2026-07-01',
      );
      expect(ergebnis).toEqual({ neu: 2, preisAenderungen: 0 });

      const bestand = await bestandLaden('kaernten');
      expect(bestand.map((i) => i.id)).toEqual(['wh-1', 'wh-2']);
      expect(bestand[0]).toMatchObject({ zuerstGesehen: '2026-07-01', zuletztGesehen: '2026-07-01' });

      const historie = await preisHistorieLaden('kaernten');
      expect(historie).toHaveLength(2);
      expect(historie[0]).toMatchObject({ inseratId: 'wh-1', preis: 200000, erfasstAm: '2026-07-01' });
    });

    it('schreibt wieder gesehene Inserate fort, zuerst_gesehen bleibt stabil', async () => {
      await bestandUpsert([inserat('wh-1')], 'kaernten', '2026-07-01');
      const ergebnis = await bestandUpsert([inserat('wh-1')], 'kaernten', '2026-07-05');
      expect(ergebnis).toEqual({ neu: 0, preisAenderungen: 0 });

      const [gespeichert] = await bestandLaden('kaernten');
      expect(gespeichert).toMatchObject({ zuerstGesehen: '2026-07-01', zuletztGesehen: '2026-07-05' });
      // keine Preisänderung → keine zweite Historien-Zeile
      expect(await preisHistorieLaden('kaernten')).toHaveLength(1);
    });

    it('erfasst Preisänderungen in der Historie', async () => {
      await bestandUpsert([inserat('wh-1', 200000)], 'kaernten', '2026-07-01');
      const ergebnis = await bestandUpsert([inserat('wh-1', 190000)], 'kaernten', '2026-07-05');
      expect(ergebnis).toEqual({ neu: 0, preisAenderungen: 1 });

      expect((await bestandLaden('kaernten'))[0]?.preis).toBe(190000);
      expect((await preisHistorieLaden('kaernten')).map((p) => p.preis)).toEqual([200000, 190000]);
    });

    it('ist idempotent am selben Tag – letzter Preis des Tages gewinnt', async () => {
      await bestandUpsert([inserat('wh-1', 200000)], 'kaernten', '2026-07-01');
      await bestandUpsert([inserat('wh-1', 195000)], 'kaernten', '2026-07-01');

      const historie = await preisHistorieLaden('kaernten');
      expect(historie).toHaveLength(1);
      expect(historie[0]?.preis).toBe(195000);
      const [gespeichert] = await bestandLaden('kaernten');
      expect(gespeichert).toMatchObject({ preis: 195000, zuletztGesehen: '2026-07-01' });
    });

    it('scoped bestandLaden und preisHistorieLaden aufs Bundesland', async () => {
      await bestandUpsert([inserat('wh-1')], 'kaernten', '2026-07-01');
      await bestandUpsert([inserat('wh-2')], 'wien', '2026-07-01');

      expect((await bestandLaden('kaernten')).map((i) => i.id)).toEqual(['wh-1']);
      expect((await preisHistorieLaden('wien')).map((p) => p.inseratId)).toEqual(['wh-2']);
    });

    it('rollt die Transaktion bei einem Fehler komplett zurück', async () => {
      const kaputt = { ...inserat('wh-2'), typ: 'ungueltig' as never };
      await expect(
        bestandUpsert([inserat('wh-1'), kaputt], 'kaernten', '2026-07-01'),
      ).rejects.toThrow();
      expect(await bestandLaden('kaernten')).toEqual([]);
    });
  });

  describe('gebiete-repo', () => {
    it('anlegen → laden → deaktivieren/aktivieren Roundtrip', async () => {
      const id = await gebietAnlegen('Villach Zentrum', KRITERIEN);

      const gebiet = await gebietLaden(id);
      expect(gebiet).toMatchObject({ name: 'Villach Zentrum', kriterien: KRITERIEN, aktiv: true });

      await gebietDeaktivieren(id);
      expect((await gebietLaden(id))?.aktiv).toBe(false);
      expect(await gebieteAuflisten(true)).toEqual([]);

      await gebietAktivieren(id);
      expect(await gebieteAuflisten(true)).toHaveLength(1);
    });

    it('Claim: einmal pro Tag, Retry nur nach Fehlschlag', async () => {
      const gebietId = await gebietAnlegen('Villach', KRITERIEN);

      const erster = await crawlLaufBeanspruchen(gebietId, '2026-07-03');
      expect(erster).toBeTypeOf('number');
      // laufender Lauf: kein zweiter Claim
      expect(await crawlLaufBeanspruchen(gebietId, '2026-07-03')).toBeUndefined();

      // fehlgeschlagen → wieder claimbar (gleiche Zeile)
      await crawlLaufFehlgeschlagen(erster!, 'Timeout');
      const retry = await crawlLaufBeanspruchen(gebietId, '2026-07-03');
      expect(retry).toBe(erster);

      // fertig → nicht mehr claimbar
      await crawlLaufAbschliessen(retry!, ['quelle A'], 42);
      expect(await crawlLaufBeanspruchen(gebietId, '2026-07-03')).toBeUndefined();
      // neuer Tag → neuer Lauf
      expect(await crawlLaufBeanspruchen(gebietId, '2026-07-04')).toBeTypeOf('number');
    });

    it('Erzwingen: re-claimt auch fertige Läufe, aber keine laufenden', async () => {
      const gebietId = await gebietAnlegen('Villach', KRITERIEN);

      // fertig → per Erzwingen wieder claimbar (gleiche Zeile, Tages-Idempotenz bleibt)
      const erster = await crawlLaufBeanspruchen(gebietId, '2026-07-03');
      await crawlLaufAbschliessen(erster!, [], 10);
      expect(await crawlLaufBeanspruchen(gebietId, '2026-07-03')).toBeUndefined();
      const erzwungen = await crawlLaufErzwingen(gebietId, '2026-07-03');
      expect(erzwungen).toBe(erster);

      // jetzt laufend → auch Erzwingen liefert nichts (kein Doppel-Crawl)
      expect(await crawlLaufErzwingen(gebietId, '2026-07-03')).toBeUndefined();
    });

    it('letzterFertigerLauf liefert Stichtag und Abschluss-Zeitpunkt des jüngsten fertigen Laufs', async () => {
      const gebietId = await gebietAnlegen('Villach', KRITERIEN);
      expect(await letzterFertigerLauf(gebietId)).toBeUndefined();

      const a = await crawlLaufBeanspruchen(gebietId, '2026-07-01');
      await crawlLaufAbschliessen(a!, [], 10);
      const b = await crawlLaufBeanspruchen(gebietId, '2026-07-02');
      await crawlLaufFehlgeschlagen(b!, 'Timeout');

      const lauf = await letzterFertigerLauf(gebietId);
      expect(lauf?.laufDatum).toBe('2026-07-01');
      expect(lauf?.beendetAm).toBeInstanceOf(Date);
    });

    it('letzteFertigeLaeufe liefert je Gebiet den letzten Abschluss – Gebiete ohne fertigen Lauf fehlen', async () => {
      const mitLauf = await gebietAnlegen('Villach', KRITERIEN);
      const ohneLauf = await gebietAnlegen('Klagenfurt', KRITERIEN);

      const a = await crawlLaufBeanspruchen(mitLauf, '2026-07-01');
      await crawlLaufAbschliessen(a!, [], 10);
      const laufend = await crawlLaufBeanspruchen(ohneLauf, '2026-07-01');
      expect(laufend).toBeTypeOf('number'); // bleibt „laufend" → zählt nicht

      const laeufe = await letzteFertigeLaeufe();
      expect(laeufe.get(mitLauf)).toBeInstanceOf(Date);
      expect(laeufe.has(ohneLauf)).toBe(false);
    });

    it('listet Läufe neueste zuerst mit Limit', async () => {
      const gebietId = await gebietAnlegen('Villach', KRITERIEN);
      for (const tag of ['2026-07-01', '2026-07-02', '2026-07-03']) {
        const id = await crawlLaufBeanspruchen(gebietId, tag);
        await crawlLaufAbschliessen(id!, [`quelle ${tag}`], 1);
      }

      const laeufe = await crawlLaeufeAuflisten(gebietId, 2);
      expect(laeufe.map((l) => l.laufDatum)).toEqual(['2026-07-03', '2026-07-02']);
      expect(laeufe[0]).toMatchObject({ status: 'fertig', inserateGesehen: 1 });
    });

    it('räumt laufende Zombie-Läufe beim Start ab', async () => {
      const gebietId = await gebietAnlegen('Villach', KRITERIEN);
      const laufend = await crawlLaufBeanspruchen(gebietId, '2026-07-03');
      const fertig = await crawlLaufBeanspruchen(gebietId, '2026-07-02');
      await crawlLaufAbschliessen(fertig!, [], 0);

      expect(await zombieCrawlLaeufeBereinigen()).toBe(1);
      const [juengster] = await crawlLaeufeAuflisten(gebietId, 1);
      expect(juengster).toMatchObject({ id: laufend, status: 'fehlgeschlagen' });
      expect(juengster?.fehler).toContain('neu gestartet');
    });
  });
});
