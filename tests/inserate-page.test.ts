import { describe, expect, it } from 'vitest';
import type { BestandInseratMitLand } from '../src/db/bestand-repo.js';
import { renderInserateSeite, type InserateSeitenDaten } from '../src/pages/inserate-page.js';

function inserat(overrides: Partial<BestandInseratMitLand> = {}): BestandInseratMitLand {
  return {
    id: 'wh-1',
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: 200000,
    flaeche_m2: 50,
    zimmer: 3,
    datum_erfasst: '2026-06-01',
    zuerstGesehen: '2026-06-01',
    zuletztGesehen: '2026-07-01',
    bundesland: 'kaernten',
    aktiv: true,
    ...overrides,
  };
}

function daten(overrides: Partial<InserateSeitenDaten> = {}): InserateSeitenDaten {
  return {
    inserate: [inserat()],
    gesamt: 1,
    seite: 1,
    proSeite: 50,
    filter: {},
    sortierung: 'zuletzt_gesehen',
    facetten: { heizung: [], zustand: [], baustil: [], ausstattung: [] },
    aenderungen: new Map(),
    ...overrides,
  };
}

describe('renderInserateSeite', () => {
  it('rendert die „Nur Ausreißer"-Checkbox: default aus, ohne Grund-Spalte', () => {
    const html = renderInserateSeite(daten());
    expect(html).toContain('name="nur" value="ausreisser">');
    expect(html).not.toContain('name="nur" value="ausreisser" checked');
    expect(html).not.toContain('Ausreißer-Grund');
    expect(html).toContain('href="/methodik#ausreisser"');
  });

  it('zeigt mit ?nur=ausreisser die Grund-Spalte mit übersetzten Labels', () => {
    const html = renderInserateSeite(
      daten({
        filter: { nurAusreisser: true },
        inserate: [
          inserat({
            flaeche_m2: 9758,
            datenqualitaet: 'flaeche_ausreisser,zimmer_ratio_ausreisser',
          }),
        ],
      }),
    );
    expect(html).toContain('name="nur" value="ausreisser" checked');
    expect(html).toContain('<th scope="col">Ausreißer-Grund</th>');
    expect(html).toContain('Fläche unplausibel · Fläche pro Zimmer unplausibel');
    // Der Filter zählt als gesetzt: Reset-Link erscheint.
    expect(html).toContain('Filter zurücksetzen');
  });

  it('trägt den Filter durch die Seiten-Navigation', () => {
    const html = renderInserateSeite(
      daten({
        filter: { nurAusreisser: true },
        gesamt: 120,
        proSeite: 50,
        inserate: [inserat({ datenqualitaet: 'flaeche_ausreisser' })],
      }),
    );
    expect(html).toContain('nur=ausreisser&seite=2');
  });

  it('Leer-State ohne weitere Filter: freundliche Datenqualitäts-Meldung', () => {
    const html = renderInserateSeite(
      daten({ filter: { nurAusreisser: true }, inserate: [], gesamt: 0 }),
    );
    expect(html).toContain('Keine Ausreißer im aktuellen Bestand — Datenqualität passt.');
    expect(html).not.toContain('Keine Inserate für diese Filter');
  });

  it('Leer-State mit weiteren Filtern: generische Meldung statt Datenqualitäts-Urteil', () => {
    // Mit Typ-Filter wäre „Datenqualität passt" eine falsche Aussage über den
    // Gesamtbestand — es könnte Ausreißer des anderen Typs geben.
    const html = renderInserateSeite(
      daten({ filter: { nurAusreisser: true, typ: 'miete' }, inserate: [], gesamt: 0 }),
    );
    expect(html).toContain('Keine Inserate für diese Filter');
    expect(html).not.toContain('Datenqualität passt');

    // Auch eine Detail-Facette ist „ein weiterer Filter".
    const mitFacette = renderInserateSeite(
      daten({ filter: { nurAusreisser: true, heizung: 'Fernwärme' }, inserate: [], gesamt: 0 }),
    );
    expect(mitFacette).toContain('Keine Inserate für diese Filter');
    expect(mitFacette).not.toContain('Datenqualität passt');
  });

  it('rendert Facetten-Selects und -Checkboxen aus den Optionen mit aktivem Zustand', () => {
    const html = renderInserateSeite(
      daten({
        facetten: {
          heizung: ['Fernwärme', 'Gasheizung'],
          zustand: ['Erstbezug'],
          baustil: [],
          ausstattung: ['Balkon', 'Lift'],
        },
        filter: { heizung: 'Fernwärme', ausstattung: ['Lift'] },
      }),
    );
    expect(html).toContain('<option value="Fernwärme" selected>Fernwärme</option>');
    expect(html).toContain('<option value="Gasheizung">Gasheizung</option>');
    expect(html).toContain('name="zustand"');
    // Leere Optionsliste ohne aktiven Wert → kein Feld.
    expect(html).not.toContain('name="baustil"');
    expect(html).toContain('name="ausstattung" value="Lift" checked');
    expect(html).toContain('name="ausstattung" value="Balkon">');
    expect(html).toContain('name="baujahr_min"');
  });

  it('bietet aktive Facetten-Werte außerhalb der Optionen mit an (handgebaute URL)', () => {
    const html = renderInserateSeite(
      daten({
        facetten: { heizung: ['Fernwärme'], zustand: [], baustil: [], ausstattung: ['Balkon'] },
        filter: { heizung: 'Gibtsnicht', ausstattung: ['Sauna'] },
        inserate: [],
        gesamt: 0,
      }),
    );
    expect(html).toContain('<option value="Gibtsnicht" selected>Gibtsnicht</option>');
    expect(html).toContain('name="ausstattung" value="Sauna" checked');
  });

  it('trägt Facetten-Filter durch die Seiten-Navigation', () => {
    const html = renderInserateSeite(
      daten({
        filter: { baujahrMin: 1980, heizung: 'Fernwärme', ausstattung: ['Balkon', 'Lift'] },
        gesamt: 120,
        proSeite: 50,
      }),
    );
    expect(html).toContain(
      'baujahr_min=1980&heizung=Fernw%C3%A4rme&ausstattung=Balkon&ausstattung=Lift&seite=2',
    );
  });

  it('zeigt den Reset-Link, wenn nur eine Facette gesetzt ist', () => {
    const html = renderInserateSeite(daten({ filter: { baujahrMax: 1990 } }));
    expect(html).toContain('Filter zurücksetzen');
    expect(renderInserateSeite(daten())).not.toContain('Filter zurücksetzen');
  });
});
