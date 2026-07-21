import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bestandLaden,
  bestandSeiteLaden,
  bestandUpsert,
  inseratAnzahlProTyp,
  plausibilitaetRebuild,
  preisHistorieFuerInserate,
  preisHistorieLaden,
} from '../src/db/bestand-repo.js';
import { holePool, schliessePool } from '../src/db/client.js';
import { detailUpsert } from '../src/db/inserat-details-repo.js';
import { wendeMigrationenAn } from '../src/db/migrieren.js';
import type { InseratMitPortal } from '../src/types.js';

/**
 * Integrationstests für den historisierten Bestand – laufen nur mit
 * DATABASE_URL (gegen immo_test).
 */

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

describe.runIf(!!process.env.DATABASE_URL)('bestand (Integration)', () => {
  beforeAll(async () => {
    await wendeMigrationenAn(holePool());
  });

  beforeEach(async () => {
    await holePool().query('TRUNCATE inserate_bestand RESTART IDENTITY CASCADE');
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

  describe('bestandSeiteLaden', () => {
    it('paginiert stabil ohne Doppler oder Lücken', async () => {
      await bestandUpsert(
        // gleicher Preis + gleiches Datum überall → nur der Tiebreaker ordnet
        ['a', 'b', 'c', 'd', 'e'].map((id) => inserat(`wh-${id}`)),
        'kaernten',
        '2026-07-01',
      );

      const seite1 = await bestandSeiteLaden({}, 'zuletzt_gesehen', 2, 0);
      const seite2 = await bestandSeiteLaden({}, 'zuletzt_gesehen', 2, 2);
      const seite3 = await bestandSeiteLaden({}, 'zuletzt_gesehen', 2, 4);
      const ids = [...seite1.inserate, ...seite2.inserate, ...seite3.inserate].map((i) => i.id);
      expect(ids).toEqual(['wh-a', 'wh-b', 'wh-c', 'wh-d', 'wh-e']);
      expect(seite1.gesamt).toBe(5);
    });

    it('markiert aktiv je Bundesland-Stichtag und filtert danach', async () => {
      await bestandUpsert([inserat('wh-alt')], 'kaernten', '2026-07-01');
      await bestandUpsert([inserat('wh-neu')], 'kaernten', '2026-07-03');
      // Wien hat einen älteren Stichtag – dort ist der 01.07. trotzdem aktiv
      await bestandUpsert([inserat('wh-wien')], 'wien', '2026-07-01');

      const alle = await bestandSeiteLaden({}, 'zuletzt_gesehen', 10, 0);
      expect(
        Object.fromEntries(alle.inserate.map((i) => [i.id, i.aktiv])),
      ).toEqual({ 'wh-alt': false, 'wh-neu': true, 'wh-wien': true });

      const aktive = await bestandSeiteLaden({ status: 'aktiv' }, 'zuletzt_gesehen', 10, 0);
      expect(aktive.inserate.map((i) => i.id).sort()).toEqual(['wh-neu', 'wh-wien']);
      expect(aktive.gesamt).toBe(2);

      const delistete = await bestandSeiteLaden({ status: 'delistet' }, 'zuletzt_gesehen', 10, 0);
      expect(delistete.inserate.map((i) => i.id)).toEqual(['wh-alt']);
    });

    it('filtert Bundesland, Typ und Ort (case-insensitiv über Ort/PLZ/Bezirk)', async () => {
      await bestandUpsert(
        [
          inserat('wh-1'),
          { ...inserat('wh-2'), typ: 'miete' as const, preis: 900 },
          { ...inserat('wh-3'), ort: 'Seeboden', plz: '9871', bezirk: 'Spittal' },
        ],
        'kaernten',
        '2026-07-01',
      );
      await bestandUpsert([inserat('wh-4')], 'wien', '2026-07-01');

      const kaernten = await bestandSeiteLaden({ bundesland: 'kaernten' }, 'preis', 10, 0);
      expect(kaernten.gesamt).toBe(3);
      expect(kaernten.inserate[0]?.bundesland).toBe('kaernten');

      const miete = await bestandSeiteLaden({ typ: 'miete' }, 'preis', 10, 0);
      expect(miete.inserate.map((i) => i.id)).toEqual(['wh-2']);

      const spittal = await bestandSeiteLaden({ ort: 'spittal' }, 'preis', 10, 0);
      expect(spittal.inserate.map((i) => i.id)).toEqual(['wh-3']);
    });

    it('escapet ILIKE-Sonderzeichen in der Ort-Suche', async () => {
      await bestandUpsert(
        [{ ...inserat('wh-1'), ort: 'Villach 100%' }, { ...inserat('wh-2'), ort: 'Villach' }],
        'kaernten',
        '2026-07-01',
      );
      const treffer = await bestandSeiteLaden({ ort: '100%' }, 'preis', 10, 0);
      expect(treffer.inserate.map((i) => i.id)).toEqual(['wh-1']);
      // „_" darf nicht als Wildcard wirken
      expect((await bestandSeiteLaden({ ort: 'V_llach' }, 'preis', 10, 0)).gesamt).toBe(0);
    });

    it('sortiert nach €/m² mit flächenlosen Inseraten am Ende', async () => {
      await bestandUpsert(
        [
          { ...inserat('wh-teuer', 300000), flaeche_m2: 50 }, // 6000 €/m²
          { ...inserat('wh-billig', 200000), flaeche_m2: 100 }, // 2000 €/m²
          { ...inserat('wh-ohne', 100000), flaeche_m2: 0 },
        ],
        'kaernten',
        '2026-07-01',
      );
      const seite = await bestandSeiteLaden({}, 'eur_m2', 10, 0);
      expect(seite.inserate.map((i) => i.id)).toEqual(['wh-billig', 'wh-teuer', 'wh-ohne']);
    });

    it('liefert jenseits der letzten Seite eine leere Liste mit korrektem gesamt', async () => {
      await bestandUpsert([inserat('wh-1')], 'kaernten', '2026-07-01');
      const seite = await bestandSeiteLaden({}, 'zuletzt_gesehen', 50, 100);
      expect(seite.inserate).toEqual([]);
      expect(seite.gesamt).toBe(1);
    });
  });

  describe('bestandSeiteLaden mit Detail-Facetten', () => {
    /** Drei Bestand-Zeilen, zwei davon mit Detail-Zeile — die Basis aller Facetten-Tests. */
    async function seedeMitDetails(): Promise<void> {
      await bestandUpsert(
        [inserat('wh-fernwaerme'), inserat('wh-gas'), inserat('wh-ohne-details')],
        'kaernten',
        '2026-07-01',
      );
      await detailUpsert('willhaben.at', 'wh-fernwaerme', {
        baujahr: 1980,
        heizung: 'Fernwärme',
        zustand: 'Erstbezug',
        ausstattung: ['Balkon', 'Lift'],
      });
      await detailUpsert('willhaben.at', 'wh-gas', {
        baujahr: 2000,
        heizung: 'Gasheizung',
        zustand: 'sehr gut',
      });
    }

    it('zeigt Inserate ohne Detail-Zeile, solange keine Facette aktiv ist', async () => {
      await seedeMitDetails();
      const alle = await bestandSeiteLaden({}, 'zuletzt_gesehen', 10, 0);
      expect(alle.gesamt).toBe(3);
      expect(alle.inserate.map((i) => i.id)).toContain('wh-ohne-details');
    });

    it('lässt Detail-lose Inserate bei aktiver Facette rausfallen', async () => {
      await seedeMitDetails();
      const seite = await bestandSeiteLaden({ heizung: 'Fernwärme' }, 'zuletzt_gesehen', 10, 0);
      expect(seite.gesamt).toBe(1);
      expect(seite.inserate.map((i) => i.id)).toEqual(['wh-fernwaerme']);
    });

    it('filtert den Baujahr-Bereich mit inklusiven Grenzen; NULL-Baujahr fällt raus', async () => {
      await bestandUpsert(
        [inserat('wh-1980'), inserat('wh-1990'), inserat('wh-2000'), inserat('wh-null')],
        'kaernten',
        '2026-07-01',
      );
      await detailUpsert('willhaben.at', 'wh-1980', { baujahr: 1980 });
      await detailUpsert('willhaben.at', 'wh-1990', { baujahr: 1990 });
      await detailUpsert('willhaben.at', 'wh-2000', { baujahr: 2000 });
      await detailUpsert('willhaben.at', 'wh-null', { zustand: 'gut' });

      const seite = await bestandSeiteLaden(
        { baujahrMin: 1980, baujahrMax: 1990 },
        'zuletzt_gesehen',
        10,
        0,
      );
      expect(seite.inserate.map((i) => i.id).sort()).toEqual(['wh-1980', 'wh-1990']);
      expect(seite.gesamt).toBe(2);
    });

    it('matcht zustand gegen d.zustand, nicht gegen das Listen-Feld b.zustand', async () => {
      await bestandUpsert(
        // Der Listen-Crawl liefert einen ANDEREN Zustand als die Detailseite.
        [{ ...inserat('wh-1'), zustand: 'Listen-Zustand' }],
        'kaernten',
        '2026-07-01',
      );
      await detailUpsert('willhaben.at', 'wh-1', { zustand: 'Detail-Zustand' });

      const detail = await bestandSeiteLaden({ zustand: 'Detail-Zustand' }, 'zuletzt_gesehen', 10, 0);
      expect(detail.inserate.map((i) => i.id)).toEqual(['wh-1']);
      const liste = await bestandSeiteLaden({ zustand: 'Listen-Zustand' }, 'zuletzt_gesehen', 10, 0);
      expect(liste.gesamt).toBe(0);
    });

    it('prüft Ausstattung per jsonb-Containment: alle gewählten Werte müssen enthalten sein', async () => {
      await seedeMitDetails();
      const balkon = await bestandSeiteLaden({ ausstattung: ['Balkon'] }, 'zuletzt_gesehen', 10, 0);
      expect(balkon.inserate.map((i) => i.id)).toEqual(['wh-fernwaerme']);

      const balkonLift = await bestandSeiteLaden(
        { ausstattung: ['Balkon', 'Lift'] },
        'zuletzt_gesehen',
        10,
        0,
      );
      expect(balkonLift.inserate.map((i) => i.id)).toEqual(['wh-fernwaerme']);

      // UND-Semantik: Garten fehlt in ['Balkon','Lift'] ⇒ kein Treffer;
      // NULL-Ausstattung (wh-gas) und Detail-los (wh-ohne-details) sowieso nicht.
      const balkonGarten = await bestandSeiteLaden(
        { ausstattung: ['Balkon', 'Garten'] },
        'zuletzt_gesehen',
        10,
        0,
      );
      expect(balkonGarten.gesamt).toBe(0);
    });

    it('verknüpft kombinierte Facetten als UND', async () => {
      await seedeMitDetails();
      // heizung allein: 1 Treffer; baujahrMin=1990 allein: 1 Treffer (wh-gas) —
      // zusammen widersprechen sie sich und liefern nichts.
      const kombi = await bestandSeiteLaden(
        { heizung: 'Fernwärme', baujahrMin: 1990 },
        'zuletzt_gesehen',
        10,
        0,
      );
      expect(kombi.gesamt).toBe(0);

      const passend = await bestandSeiteLaden(
        { heizung: 'Fernwärme', baujahrMax: 1990, ausstattung: ['Lift'] },
        'zuletzt_gesehen',
        10,
        0,
      );
      expect(passend.inserate.map((i) => i.id)).toEqual(['wh-fernwaerme']);
    });

    it('liefert für unbekannte Facetten-Werte 0 Treffer statt eines Fehlers', async () => {
      await seedeMitDetails();
      const seite = await bestandSeiteLaden({ heizung: 'Gibtsnicht' }, 'zuletzt_gesehen', 10, 0);
      expect(seite.gesamt).toBe(0);
      expect(seite.inserate).toEqual([]);
    });
  });

  describe('inseratAnzahlProTyp', () => {
    it('zählt nur Inserate mit zuletzt_gesehen = Stichtag, getrennt nach Typ', async () => {
      await bestandUpsert(
        [inserat('wh-1'), inserat('wh-2'), { ...inserat('wh-3'), typ: 'miete' as const, preis: 900 }],
        'kaernten',
        '2026-07-07',
      );
      // wh-1 wird beim nächsten Lauf wieder gesehen, wh-2/wh-3 nicht.
      await bestandUpsert([inserat('wh-1')], 'kaernten', '2026-07-09');
      // Anderes Bundesland zählt nicht mit.
      await bestandUpsert([inserat('wh-wien')], 'wien', '2026-07-09');

      expect(await inseratAnzahlProTyp('kaernten', '2026-07-09')).toEqual({ kauf: 1, miete: 0 });
      expect(await inseratAnzahlProTyp('kaernten', '2026-07-07')).toEqual({ kauf: 1, miete: 1 });
    });

    it('liefert Nullen ohne Treffer', async () => {
      expect(await inseratAnzahlProTyp('kaernten', '2026-07-09')).toEqual({ kauf: 0, miete: 0 });
    });
  });

  describe('datenqualitaet', () => {
    /** Der 1.2-Screenshot-Fall: 9758 m² Grundstück als Wohnfläche erfasst. */
    function defekt(id: string): InseratMitPortal {
      return { ...inserat(id, 230000), flaeche_m2: 9758 };
    }

    it('flaggt unplausible Inserate beim Insert, plausible bleiben NULL', async () => {
      await bestandUpsert([inserat('wh-ok'), defekt('wh-defekt')], 'kaernten', '2026-07-01');
      const bestand = await bestandLaden('kaernten');
      expect(Object.fromEntries(bestand.map((i) => [i.id, i.datenqualitaet]))).toEqual({
        'wh-ok': undefined,
        'wh-defekt': 'flaeche_ausreisser,zimmer_ratio_ausreisser',
      });
    });

    it('re-evaluiert beim Wieder-Sehen aus den frischen Portal-Feldern', async () => {
      await bestandUpsert([inserat('wh-1', 200000)], 'kaernten', '2026-07-01');
      expect((await bestandLaden('kaernten'))[0]?.datenqualitaet).toBeUndefined();

      // Das Portal liefert jetzt einen absurden Preis: der Sweep fängt es.
      await bestandUpsert([inserat('wh-1', 5_000_000)], 'kaernten', '2026-07-05');
      expect((await bestandLaden('kaernten'))[0]?.datenqualitaet).toBe(
        'eurm2_kauf_ausreisser,preis_kauf_ausreisser',
      );

      // Und zurück: die Korrektur räumt das Flag wieder ab.
      await bestandUpsert([inserat('wh-1', 200000)], 'kaernten', '2026-07-06');
      expect((await bestandLaden('kaernten'))[0]?.datenqualitaet).toBeUndefined();
    });

    it('schreibt bei einer Portal-Korrektur Fläche/Zimmer mit — Flag und Zeile bleiben konsistent', async () => {
      await bestandUpsert([defekt('wh-1')], 'kaernten', '2026-07-01');
      // Das Portal korrigiert die Grundstücks- zur Wohnfläche: Flag weg UND
      // die Zeile trägt die korrigierten Werte (sonst rechnete das Dashboard
      // ungeflaggt mit der alten 9758-m²-Fläche weiter).
      await bestandUpsert(
        [{ ...inserat('wh-1', 230000), flaeche_m2: 90, zimmer: 4 }],
        'kaernten',
        '2026-07-05',
      );
      const [gespeichert] = await bestandLaden('kaernten');
      expect(gespeichert).toMatchObject({ flaeche_m2: 90, zimmer: 4 });
      expect(gespeichert?.datenqualitaet).toBeUndefined();
      // Der Rebuild sieht dieselben Werte und ändert nichts mehr — kein
      // Flip-Flop zwischen Sweep und Rebuild.
      expect(await plausibilitaetRebuild()).toEqual({
        geprueft: 1,
        geflaggt: 0,
        entflaggt: 0,
        unveraendert: 1,
      });
    });

    it('bestandSeiteLaden mit nurAusreisser liefert nur geflaggte Zeilen', async () => {
      await bestandUpsert([inserat('wh-ok'), defekt('wh-defekt')], 'kaernten', '2026-07-01');
      const seite = await bestandSeiteLaden({ nurAusreisser: true }, 'zuletzt_gesehen', 10, 0);
      expect(seite.gesamt).toBe(1);
      expect(seite.inserate.map((i) => [i.id, i.datenqualitaet])).toEqual([
        ['wh-defekt', 'flaeche_ausreisser,zimmer_ratio_ausreisser'],
      ]);
    });

    it('plausibilitaetRebuild holt Alt-Zeilen nach und ist idempotent (Keyset-Batches)', async () => {
      await bestandUpsert(
        [inserat('wh-1'), inserat('wh-2'), defekt('wh-defekt')],
        'kaernten',
        '2026-07-01',
      );
      // Alt-Zustand vor Migration 007 simulieren: Spalte überall NULL.
      await holePool().query('UPDATE inserate_bestand SET datenqualitaet = NULL');

      const stand = await plausibilitaetRebuild({ batchGroesse: 1 });
      expect(stand).toEqual({ geprueft: 3, geflaggt: 1, entflaggt: 0, unveraendert: 2 });
      const bestand = await bestandLaden('kaernten');
      expect(bestand.find((i) => i.id === 'wh-defekt')?.datenqualitaet).toBe(
        'flaeche_ausreisser,zimmer_ratio_ausreisser',
      );

      // Zweiter Lauf ändert nichts mehr.
      expect(await plausibilitaetRebuild({ batchGroesse: 1 })).toEqual({
        geprueft: 3,
        geflaggt: 0,
        entflaggt: 0,
        unveraendert: 3,
      });
    });

    it('plausibilitaetRebuild entflaggt Zeilen, deren Grenzen-Befund entfallen ist', async () => {
      await bestandUpsert([inserat('wh-1')], 'kaernten', '2026-07-01');
      await holePool().query(
        `UPDATE inserate_bestand SET datenqualitaet = 'flaeche_ausreisser' WHERE inserat_id = 'wh-1'`,
      );
      const stand = await plausibilitaetRebuild();
      expect(stand).toEqual({ geprueft: 1, geflaggt: 0, entflaggt: 1, unveraendert: 0 });
      expect((await bestandLaden('kaernten'))[0]?.datenqualitaet).toBeUndefined();
    });
  });

  describe('preisHistorieFuerInserate', () => {
    it('liefert nur die Historie der übergebenen Inserate, chronologisch', async () => {
      await bestandUpsert([inserat('wh-1', 200000), inserat('wh-2', 100000)], 'kaernten', '2026-07-01');
      await bestandUpsert([inserat('wh-1', 190000), inserat('wh-2', 90000)], 'kaernten', '2026-07-05');

      const historie = await preisHistorieFuerInserate([{ portal: 'willhaben.at', id: 'wh-1' }]);
      expect(historie.map((p) => [p.inseratId, p.preis])).toEqual([
        ['wh-1', 200000],
        ['wh-1', 190000],
      ]);
    });

    it('liefert für eine leere Liste sofort ein leeres Array', async () => {
      expect(await preisHistorieFuerInserate([])).toEqual([]);
    });
  });

});
