import { describe, expect, it } from 'vitest';
import {
  PortalFehler,
  type PortalAdapter,
  type PortalSuchErgebnis,
} from '../src/adapters/portal-adapter.js';
import { crawlePortale } from '../src/suchlauf.js';
import type { SuchKriterien } from '../src/search.js';
import type { Inserat } from '../src/types.js';

const KRITERIEN: SuchKriterien = { bundesland: 'kaernten', typ: 'beide' };

function inserat(id: string): Inserat {
  return {
    id,
    typ: 'kauf',
    ort: 'Villach',
    plz: '9500',
    bezirk: 'Villach Stadt',
    preis: 200000,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-07-02',
  };
}

function fakePortal(portal: string, ergebnisse: PortalSuchErgebnis[] | Error): PortalAdapter {
  return {
    name: portal,
    portal,
    canHandle: () => false,
    fetch: () => Promise.reject(new Error('nicht benutzt')),
    sucheMitStatistik: () =>
      ergebnisse instanceof Error ? Promise.reject(ergebnisse) : Promise.resolve(ergebnisse),
  };
}

function ergebnis(inserate: Inserat[], uebersprungen = 0): PortalSuchErgebnis {
  return { typ: 'kauf', inserate, uebersprungen, gesamtTreffer: inserate.length + uebersprungen };
}

describe('crawlePortale', () => {
  it('kombiniert Inserate aller Portale und dedupliziert pro Portal-ID', async () => {
    const a = fakePortal('portal-a', [ergebnis([inserat('X1'), inserat('X1'), inserat('X2')])]);
    const b = fakePortal('portal-b', [ergebnis([inserat('Y1')])]);

    const { inserate, quellen } = await crawlePortale([a, b], KRITERIEN);
    expect(inserate.map((i) => i.id)).toEqual(['X1', 'X2', 'Y1']);
    expect(quellen).toHaveLength(2);
    expect(quellen[0]).toContain('portal-a Kärnten');
  });

  it('degradiert ein ausgefallenes Portal zu einer Quellen-Zeile', async () => {
    const kaputt = fakePortal('portal-a', new PortalFehler('Timeout'));
    const ok = fakePortal('portal-b', [ergebnis([inserat('Y1')], 2)]);

    const { inserate, quellen } = await crawlePortale([kaputt, ok], KRITERIEN);
    expect(inserate.map((i) => i.id)).toEqual(['Y1']);
    expect(quellen[0]).toContain('nicht abfragbar (Timeout)');
    expect(quellen[1]).toContain('2 ohne verwertbare Daten');
  });

  it('wirft den ersten PortalFehler, wenn alle Portale scheitern', async () => {
    const a = fakePortal('portal-a', new PortalFehler('Timeout A'));
    const b = fakePortal('portal-b', new PortalFehler('Timeout B'));

    await expect(crawlePortale([a, b], KRITERIEN)).rejects.toThrow('Timeout A');
  });

  it('reicht unerwartete Fehler unverändert durch', async () => {
    const a = fakePortal('portal-a', new TypeError('kaputt'));
    await expect(crawlePortale([a], KRITERIEN)).rejects.toThrow(TypeError);
  });
});
