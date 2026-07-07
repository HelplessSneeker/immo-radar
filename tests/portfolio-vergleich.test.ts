import { describe, expect, it } from 'vitest';
import type { PortfolioObjekt } from '../src/db/portfolio-repo.js';
import { vergleichePortfolio } from '../src/portfolio-vergleich.js';
import { objekteAusBestand, type ObjektZeitreihe } from '../src/trend.js';
import type { BestandInserat, PreisPunkt } from '../src/db/bestand-repo.js';

const STICHTAG = '2026-07-07';

function portfolioObjekt(overrides: Partial<PortfolioObjekt> = {}): PortfolioObjekt {
  return {
    id: 1,
    bezeichnung: 'Testwohnung',
    plz: '9020',
    ort: 'Klagenfurt',
    kaufpreis: 200000,
    mieteMonat: 500,
    flaecheM2: 50,
    zimmer: 2,
    erstelltAm: new Date('2026-01-01T00:00:00Z'),
    aktualisiertAm: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** n aktive Markt-Objekte eines Typs in einer PLZ, alle zum selben €/m². */
function marktObjekte(
  typ: 'kauf' | 'miete',
  plz: string,
  bezirk: string,
  eurM2: number,
  anzahl: number,
  praefix: string,
): ObjektZeitreihe[] {
  const flaeche = 50;
  const bestand: BestandInserat[] = [];
  const historie: PreisPunkt[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    const id = `${praefix}-${i}`;
    bestand.push({
      id,
      portal: 'willhaben.at',
      typ,
      ort: 'Testort',
      plz,
      bezirk,
      preis: eurM2 * flaeche,
      flaeche_m2: flaeche,
      zimmer: 2,
      datum_erfasst: '2026-06-01',
      zuerstGesehen: '2026-06-01',
      zuletztGesehen: STICHTAG,
    });
    historie.push({ portal: 'willhaben.at', inseratId: id, preis: eurM2 * flaeche, erfasstAm: '2026-06-01' });
  }
  return objekteAusBestand(bestand, historie);
}

describe('vergleichePortfolio', () => {
  it('vergleicht auf PLZ-Ebene, wenn genug Vergleichsobjekte da sind', () => {
    const markt = [
      ...marktObjekte('miete', '9020', 'Klagenfurt Stadt', 12, 5, 'm'),
      ...marktObjekte('kauf', '9020', 'Klagenfurt Stadt', 4000, 5, 'k'),
    ];
    const v = vergleichePortfolio(portfolioObjekt(), markt, STICHTAG);

    expect(v.eigeneMieteM2).toBe(10); // 500 / 50
    expect(v.eigeneRendite).toBeCloseTo(0.03); // 6000 / 200000
    expect(v.miete).toMatchObject({ ebene: 'plz', marktMieteM2: 12, anzahl: 5 });
    expect(v.rendite).toMatchObject({ ebene: 'plz' });
    expect(v.rendite!.marktRendite).toBeCloseTo((12 * 12) / 4000); // 3,6 %
    // Unter Markt: (12 − 10) × 50 = 100 € Potenzial pro Monat.
    expect(v.mietPotenzialMonat).toBeCloseTo(100);
  });

  it('steigt bei dünner PLZ auf den Bezirk auf (Mehrheits-Zuordnung) und weist die Ebene aus', () => {
    const markt = [
      // Nur 2 Miet-Objekte in der eigenen PLZ (zu wenig) …
      ...marktObjekte('miete', '9020', 'Klagenfurt Stadt', 11, 2, 'eigen'),
      // … aber genug im selben Bezirk unter anderer PLZ.
      ...marktObjekte('miete', '9021', 'Klagenfurt Stadt', 13, 4, 'nachbar'),
    ];
    const v = vergleichePortfolio(portfolioObjekt(), markt, STICHTAG);
    expect(v.miete).toMatchObject({ ebene: 'bezirk', anzahl: 6 });
    // Median über alle 6 Bezirk-Objekte: [11,11,13,13,13,13] → 13.
    expect(v.miete!.marktMieteM2).toBe(13);
  });

  it('fällt bis Kärnten zurück und lässt den Vergleich weg, wenn selbst das zu dünn ist', () => {
    const markt = marktObjekte('miete', '9800', 'Spittal an der Drau', 9, 5, 'fern');
    const v = vergleichePortfolio(portfolioObjekt(), markt, STICHTAG);
    // Keine 9020er, kein Bezirk ableitbar → Land-Ebene greift.
    expect(v.miete).toMatchObject({ ebene: 'land', anzahl: 5 });

    const duenn = vergleichePortfolio(
      portfolioObjekt(),
      marktObjekte('miete', '9800', 'Spittal an der Drau', 9, 4, 'fern'),
      STICHTAG,
    );
    expect(duenn.miete).toBeUndefined();
  });

  it('Rendite-Vergleich braucht beide Marktseiten — sonst bleibt er weg', () => {
    const nurMiete = marktObjekte('miete', '9020', 'Klagenfurt Stadt', 12, 8, 'm');
    const v = vergleichePortfolio(portfolioObjekt(), nurMiete, STICHTAG);
    expect(v.miete).toBeDefined();
    expect(v.rendite).toBeUndefined();
  });

  it('leerstehend: keine eigene Miete/Rendite, kein Potenzial — Marktwerte bleiben', () => {
    const markt = [
      ...marktObjekte('miete', '9020', 'Klagenfurt Stadt', 12, 5, 'm'),
      ...marktObjekte('kauf', '9020', 'Klagenfurt Stadt', 4000, 5, 'k'),
    ];
    const leer = portfolioObjekt();
    delete (leer as { mieteMonat?: number }).mieteMonat;
    const v = vergleichePortfolio(leer, markt, STICHTAG);
    expect(v.eigeneMieteM2).toBeUndefined();
    expect(v.eigeneRendite).toBeUndefined();
    expect(v.mietPotenzialMonat).toBeUndefined();
    expect(v.miete).toBeDefined();
  });

  it('kein Potenzial, wenn die eigene Miete über dem Markt liegt', () => {
    const markt = marktObjekte('miete', '9020', 'Klagenfurt Stadt', 8, 5, 'm');
    const v = vergleichePortfolio(portfolioObjekt(), markt, STICHTAG); // eigene: 10 €/m²
    expect(v.mietPotenzialMonat).toBeUndefined();
  });

  it('delistete Markt-Objekte zählen nicht als Vergleich', () => {
    const bestand: BestandInserat[] = Array.from({ length: 5 }, (_, i) => ({
      id: `alt-${i}`,
      portal: 'willhaben.at',
      typ: 'miete' as const,
      ort: 'Klagenfurt',
      plz: '9020',
      bezirk: 'Klagenfurt Stadt',
      preis: 600,
      flaeche_m2: 50,
      zimmer: 2,
      datum_erfasst: '2026-05-01',
      zuerstGesehen: '2026-05-01',
      zuletztGesehen: '2026-06-01', // lange vor dem Stichtag delistet
    }));
    const historie = bestand.map((b) => ({
      portal: b.portal,
      inseratId: b.id,
      preis: b.preis,
      erfasstAm: '2026-05-01',
    }));
    const v = vergleichePortfolio(portfolioObjekt(), objekteAusBestand(bestand, historie), STICHTAG);
    expect(v.miete).toBeUndefined();
  });
});
