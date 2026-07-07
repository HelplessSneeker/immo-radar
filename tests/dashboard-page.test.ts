import { describe, expect, it } from 'vitest';
import {
  renderDashboardOhneDatenSeite,
  renderDashboardSeite,
  type DashboardDaten,
} from '../src/pages/dashboard-page.js';
import { parseDashboardFilter } from '../src/search.js';

function daten(overrides: Partial<DashboardDaten> = {}): DashboardDaten {
  return {
    stichtag: '2026-07-07',
    sweepBeendetAm: new Date('2026-07-07T04:30:00Z'),
    portalAusfaelle: [],
    sweepLaeuft: false,
    trend: [
      { datum: '2026-06-30', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 40, anzahlMiete: 30 },
      { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
    ],
    renditeTrend: [
      { datum: '2026-06-30', bruttoRendite: 0.0302 },
      { datum: '2026-07-07', bruttoRendite: 0.03 },
    ],
    filter: {},
    zielRendite: 0.04,
    ...overrides,
  };
}

describe('renderDashboardSeite', () => {
  it('zeigt KPIs mit Urteil: Rendite unter Ziel ohne Good-Kachel', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('3,00 %');
    expect(html).toContain('unter Ziel (≥ 4 %)');
    expect(html).not.toContain('class="tile tile-good"'); // CSS-Regel zählt nicht
    expect(html).toContain('4 000 €/m²'); // de-AT gruppiert mit NBSP
    expect(html).toContain('10,00 €/m²');
    expect(html).toContain('42 aktive Kauf-Objekte');
  });

  it('hebt eine Rendite über dem Ziel hervor', () => {
    const html = renderDashboardSeite(
      daten({ renditeTrend: [{ datum: '2026-07-07', bruttoRendite: 0.045 }] }),
    );
    expect(html).toContain('class="tile tile-good"');
    expect(html).toContain('Ziel ≥ 4 % erreicht');
  });

  it('spiegelt aktive Filter in der Überschrift und escapt die Eingaben', () => {
    const html = renderDashboardSeite(daten({ filter: { plz: '9020', flaecheMin: 45, flaecheMax: 90 } }));
    expect(html).toContain('Wohnungsmarkt Kärnten · PLZ 9020 · 45–90 m²');
    expect(html).toContain('value="9020"');
    expect(html).toContain('Filter zurücksetzen');
  });

  it('warnt bei Portal-Ausfällen des Stichtag-Sweeps', () => {
    const html = renderDashboardSeite(daten({ portalAusfaelle: ['willhaben.at Hermagor: 403'] }));
    expect(html).toContain('nicht abfragbar');
    expect(html).toContain('href="/crawl"');
  });

  it('serialisiert die Zeitreihen "</script>"-sicher ins Chart-Skript', () => {
    const html = renderDashboardSeite(daten());
    expect(html).toContain('const TREND = [');
    expect(html).toContain('const RENDITE = [');
    expect(html).toContain('"bruttoRendite":0.03');
    expect(html).not.toContain('</script><script>alert');
  });

  it('zeigt ohne Objekte im Filter den Leerzustand statt Charts', () => {
    const html = renderDashboardSeite(daten({ trend: [], renditeTrend: [], filter: { plz: '1010' } }));
    expect(html).toContain('Keine Objekte im gewählten Filter');
    expect(html).not.toContain('<canvas');
  });
});

describe('renderDashboardOhneDatenSeite', () => {
  it('unterscheidet "läuft gerade" von "steht aus"', () => {
    expect(renderDashboardOhneDatenSeite(true)).toContain('läuft gerade');
    expect(renderDashboardOhneDatenSeite(false)).toContain('steht noch aus');
  });
});

describe('parseDashboardFilter', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('akzeptiert PLZ-Präfixe (1–4 Ziffern) und verwirft Unfug still', () => {
    expect(parseDashboardFilter(params('plz=9020'))).toEqual({ plz: '9020' });
    expect(parseDashboardFilter(params('plz=9'))).toEqual({ plz: '9' });
    expect(parseDashboardFilter(params('plz=90201'))).toEqual({});
    expect(parseDashboardFilter(params('plz=abc'))).toEqual({});
    expect(parseDashboardFilter(params(''))).toEqual({});
  });

  it('parst den m²-Bereich nachsichtig (Komma, Negatives verworfen, verdreht → getauscht)', () => {
    expect(parseDashboardFilter(params('flaeche_min=45&flaeche_max=90'))).toEqual({
      flaecheMin: 45,
      flaecheMax: 90,
    });
    expect(parseDashboardFilter(params('flaeche_min=45,5'))).toEqual({ flaecheMin: 45.5 });
    expect(parseDashboardFilter(params('flaeche_min=-3&flaeche_max=quatsch'))).toEqual({});
    expect(parseDashboardFilter(params('flaeche_min=90&flaeche_max=45'))).toEqual({
      flaecheMin: 45,
      flaecheMax: 90,
    });
  });
});
