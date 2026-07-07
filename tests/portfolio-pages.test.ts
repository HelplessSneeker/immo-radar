import { describe, expect, it } from 'vitest';
import type { PortfolioObjekt } from '../src/db/portfolio-repo.js';
import {
  renderPortfolioBearbeitenSeite,
  renderPortfolioSeite,
  type PortfolioSeitenDaten,
} from '../src/pages/portfolio-pages.js';
import { parsePortfolioForm, SuchKriterienFehler } from '../src/search.js';

function objekt(overrides: Partial<PortfolioObjekt> = {}): PortfolioObjekt {
  return {
    id: 3,
    bezeichnung: 'Wohnung <Villacher> Straße',
    plz: '9020',
    ort: 'Klagenfurt',
    kaufpreis: 180000,
    mieteMonat: 650,
    flaecheM2: 62,
    zimmer: 3,
    erstelltAm: new Date('2026-01-01T00:00:00Z'),
    aktualisiertAm: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function daten(overrides: Partial<PortfolioSeitenDaten> = {}): PortfolioSeitenDaten {
  return { zeilen: [], zielRendite: 0.04, stichtag: '2026-07-07', ...overrides };
}

describe('renderPortfolioSeite', () => {
  it('escapt Nutzereingaben und zeigt Vergleich samt Ebene und Potenzial', () => {
    const html = renderPortfolioSeite(
      daten({
        zeilen: [
          {
            objekt: objekt(),
            vergleich: {
              eigeneMieteM2: 650 / 62,
              eigeneRendite: (650 * 12) / 180000,
              miete: { ebene: 'bezirk', marktMieteM2: 12, anzahl: 9 },
              rendite: { ebene: 'land', marktRendite: 0.038, anzahlKauf: 40, anzahlMiete: 30 },
              mietPotenzialMonat: 94,
            },
          },
        ],
      }),
    );
    expect(html).toContain('Wohnung &lt;Villacher&gt; Straße');
    expect(html).not.toContain('Wohnung <Villacher>');
    expect(html).toContain('gleicher Bezirk');
    expect(html).toContain('ganz Kärnten');
    expect(html).toContain('+94 € Potenzial/Monat');
    // Eigene Rendite 4,33 % ≥ Ziel → Urteils-Hervorhebung.
    expect(html).toContain('ueber-markt');
  });

  it('kennzeichnet leerstehende Objekte und dünne Vergleichslagen', () => {
    const html = renderPortfolioSeite(
      daten({
        zeilen: [{ objekt: objekt({ mieteMonat: undefined }), vergleich: {} }],
      }),
    );
    expect(html).toContain('leerstehend');
  });

  it('re-rendert das Formular mit Fehlermeldung und Eingabewerten', () => {
    const werte = new URLSearchParams({ bezeichnung: 'Neu & schön', plz: '90' });
    const html = renderPortfolioSeite(daten({ fehler: { werte, meldung: 'Die PLZ muss 4-stellig sein.' } }));
    expect(html).toContain('Die PLZ muss 4-stellig sein.');
    expect(html).toContain('value="Neu &amp; schön"');
    expect(html).toContain('value="90"');
  });

  it('weist ohne Sweep auf den fehlenden Marktvergleich hin', () => {
    const html = renderPortfolioSeite({ zeilen: [], zielRendite: 0.04 });
    expect(html).toContain('Noch kein fertiger Sweep');
  });
});

describe('renderPortfolioBearbeitenSeite', () => {
  it('befüllt das Formular aus dem Objekt vor', () => {
    const html = renderPortfolioBearbeitenSeite(objekt({ kaufdatum: '2024-03-15', baujahr: 1992 }));
    expect(html).toContain('action="/portfolio/3/bearbeiten"');
    expect(html).toContain('value="180000"');
    expect(html).toContain('value="2024-03-15"');
    expect(html).toContain('value="1992"');
  });
});

describe('parsePortfolioForm', () => {
  const form = (eintraege: Record<string, string>) => new URLSearchParams(eintraege);
  const GUELTIG = {
    bezeichnung: 'Wohnung A',
    plz: '9020',
    ort: 'Klagenfurt',
    kaufpreis: '180000',
    flaeche_m2: '62',
    zimmer: '3',
  };

  it('parst ein vollständiges Formular inklusive Optionalem', () => {
    expect(
      parsePortfolioForm(
        form({ ...GUELTIG, kaufdatum: '2024-03-15', miete_monat: '650', baujahr: '1992' }),
      ),
    ).toEqual({
      bezeichnung: 'Wohnung A',
      plz: '9020',
      ort: 'Klagenfurt',
      kaufpreis: 180000,
      kaufdatum: '2024-03-15',
      mieteMonat: 650,
      flaecheM2: 62,
      zimmer: 3,
      baujahr: 1992,
    });
  });

  it('leere optionale Felder bleiben weg (leerstehend erlaubt)', () => {
    const werte = parsePortfolioForm(form({ ...GUELTIG, miete_monat: '', kaufdatum: '' }));
    expect(werte.mieteMonat).toBeUndefined();
    expect(werte.kaufdatum).toBeUndefined();
  });

  it('wirft verständliche Fehler bei Pflichtfeldern und Formaten', () => {
    expect(() => parsePortfolioForm(form({ ...GUELTIG, bezeichnung: ' ' }))).toThrow(
      SuchKriterienFehler,
    );
    expect(() => parsePortfolioForm(form({ ...GUELTIG, plz: '90' }))).toThrow(/4-stellig/);
    expect(() => parsePortfolioForm(form({ ...GUELTIG, kaufpreis: '-5' }))).toThrow(/positive Zahl/);
    expect(() => parsePortfolioForm(form({ ...GUELTIG, kaufdatum: '15.03.2024' }))).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => parsePortfolioForm(form({ ...GUELTIG, baujahr: '17' }))).toThrow(/plausibles Jahr/);
  });
});
