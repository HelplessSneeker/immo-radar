import { describe, expect, it } from 'vitest';
import {
  renderTopPicksOhneDatenSeite,
  renderTopPicksSeite,
  type TopPicksDaten,
} from '../src/pages/top-picks-page.js';
import type { TopPickKandidat } from '../src/top-picks.js';

function pick(overrides: Partial<TopPickKandidat> = {}): TopPickKandidat {
  return {
    objektId: 1,
    plz: '9020',
    ort: 'Klagenfurt',
    bezirk: 'Klagenfurt Stadt',
    zimmer: 3,
    flaecheM2: 50,
    kaufpreis: 200000,
    eurM2: 4000,
    medianMieteEurM2: 10,
    bruttoRendite: 0.03,
    mieteBasis: 'plz',
    portal: 'willhaben.at',
    inseratId: 'wh-1',
    url: 'https://willhaben.at/wh-1',
    ...overrides,
  };
}

function daten(overrides: Partial<TopPicksDaten> = {}): TopPicksDaten {
  return {
    stichtag: '2026-07-07',
    picks: [pick()],
    zielRendite: 0.04,
    ...overrides,
  };
}

describe('renderTopPicksSeite', () => {
  it('rendert Header mit Stichtag und Methodik-Link', () => {
    const html = renderTopPicksSeite(daten());
    expect(html).toContain('Top Picks — Bruttorendite je Objekt (Stichtag 07.07.2026)');
    expect(html).toContain('href="/methodik#top-picks"');
  });

  it('rendert die Zeile mit Portal-Link und de-AT-Formaten', () => {
    const html = renderTopPicksSeite(daten());
    expect(html).toContain('<a href="https://willhaben.at/wh-1">Klagenfurt · 3 Zi.</a>');
    expect(html).toContain('<span class="sub">willhaben.at</span>');
    expect(html).toContain('9020<span class="sub">Klagenfurt Stadt</span>');
    expect(html).toContain('50 m²');
    // de-AT gruppiert mit NBSP (U+00A0).
    expect(html).toContain('200 000 €');
    expect(html).toContain('4 000');
    expect(html).toContain('10,00');
    expect(html).toContain('3,00 %');
  });

  it('rendert den Titel ohne Link, wenn keine URL vorhanden ist', () => {
    const p = pick();
    delete p.url;
    const html = renderTopPicksSeite(daten({ picks: [p] }));
    expect(html).toContain('Klagenfurt · 3 Zi.');
    expect(html).not.toContain('<a href="https://willhaben.at/wh-1">');
  });

  it('zeigt die Miet-Basis als neutralen Badge', () => {
    const faelle = [
      ['plz', 'Miete aus PLZ'],
      ['bezirk', 'Miete aus Bezirk'],
      ['kaernten', 'Miete aus Kärnten'],
    ] as const;
    for (const [basis, label] of faelle) {
      const html = renderTopPicksSeite(daten({ picks: [pick({ mieteBasis: basis })] }));
      expect(html).toContain(`<span class="sub badge">${label}</span>`);
      expect(html).not.toContain('badge-critical');
    }
  });

  it('hebt die Rendite ab Ziel grün hervor — mit Text-Marker, nicht nur Farbe', () => {
    const html = renderTopPicksSeite(daten({ picks: [pick({ bruttoRendite: 0.05 })] }));
    expect(html).toContain('<td class="num zelle-gut">');
    expect(html).toContain('<span class="gut">5,00 %</span>');
    expect(html).toContain('≥ Ziel 4 %');
  });

  it('lässt die Rendite unter Ziel neutral', () => {
    // Nur das Markup prüfen — die Klassennamen selbst stehen immer im CSS-Block.
    const html = renderTopPicksSeite(daten({ picks: [pick({ bruttoRendite: 0.03 })] }));
    expect(html).not.toContain('<td class="num zelle-gut">');
    expect(html).not.toContain('<span class="gut">');
    expect(html).not.toContain('≥ Ziel 4 %');
  });

  it('spiegelt den PLZ-Filter im Formular und bietet den Reset-Link', () => {
    const html = renderTopPicksSeite(daten({ filterPlz: '9020' }));
    expect(html).toContain('action="/top-picks"');
    expect(html).toContain('value="9020"');
    expect(html).toContain('Filter zurücksetzen');
    expect(html).toContain('PLZ 9020');
  });

  it('zeigt ohne Filter keinen Reset-Link und keine Fremd-Felder', () => {
    const html = renderTopPicksSeite(daten());
    expect(html).not.toContain('Filter zurücksetzen');
    expect(html).not.toContain('name="flaeche_min"');
    expect(html).not.toContain('name="ausreisser"');
  });

  it('rendert einen Leer-State statt der Tabelle', () => {
    const html = renderTopPicksSeite(daten({ picks: [] }));
    expect(html).not.toContain('<table');
    expect(html).toContain('Keine Kauf-Objekte mit belastbarer Miet-Vergleichsbasis');
  });

  it('verlinkt im gefilterten Leer-State auf das Zurücksetzen', () => {
    const html = renderTopPicksSeite(daten({ picks: [], filterPlz: '9999' }));
    expect(html).toContain('„9999"');
    expect(html).toContain('<a href="/top-picks">Filter zurücksetzen</a>');
  });

  it('escapt Ort und URL', () => {
    const html = renderTopPicksSeite(
      daten({
        picks: [pick({ ort: '<b>Böse</b>', url: 'https://example.com/?a="b"' })],
      }),
    );
    expect(html).toContain('&lt;b&gt;Böse&lt;/b&gt;');
    expect(html).toContain('https://example.com/?a=&quot;b&quot;');
    expect(html).not.toContain('<b>Böse</b>');
  });

  it('markiert Top Picks in der Navigation als aktiv', () => {
    const html = renderTopPicksSeite(daten());
    expect(html).toContain('<a href="/top-picks" aria-current="page">Top Picks</a>');
  });
});

describe('renderTopPicksOhneDatenSeite', () => {
  it('unterscheidet laufenden von ausstehendem Sweep', () => {
    expect(renderTopPicksOhneDatenSeite(true)).toContain('läuft gerade');
    expect(renderTopPicksOhneDatenSeite(false)).toContain('steht noch aus');
  });

  it('markiert die Navigation auch ohne Daten', () => {
    expect(renderTopPicksOhneDatenSeite(false)).toContain(
      '<a href="/top-picks" aria-current="page">Top Picks</a>',
    );
  });
});
