import { describe, expect, it } from 'vitest';
import { html, join, raw } from '../src/pages/ui/html.js';
import { kopfzelle, tabelle, zelle } from '../src/pages/ui/tabelle.js';

describe('kopfzelle / zelle', () => {
  it('kopfzelle: scope immer, num als class dahinter (Ist-Reihenfolge)', () => {
    expect(String(kopfzelle({ text: 'Inserat' }))).toBe('<th scope="col">Inserat</th>');
    expect(String(kopfzelle({ text: 'Preis', num: true }))).toBe('<th scope="col" class="num">Preis</th>');
  });

  it('zelle: class VOR data-label (Karten-Modus)', () => {
    expect(String(zelle({ inhalt: html`200 000 €`, num: true, label: 'Preis' }))).toBe(
      '<td class="num" data-label="Preis">200 000 €</td>',
    );
    expect(String(zelle({ inhalt: 'x' }))).toBe('<td>x</td>');
  });
});

describe('tabelle', () => {
  it('rendert das Gerüst der Bestand-Tabellen byte-genau (einzug 4, mit Karten)', () => {
    const t = tabelle({
      kopf: join([kopfzelle({ text: 'Objekt' }), kopfzelle({ text: 'Preis', num: true })]),
      zeilen: raw('        <tr><td>x</td><td class="num">1</td></tr>'),
      karten: true,
    });
    expect(String(t)).toBe(`    <div class="tabelle-scroll">
    <table class="tabelle-karten">
      <thead><tr><th scope="col">Objekt</th><th scope="col" class="num">Preis</th></tr></thead>
      <tbody>
        <tr><td>x</td><td class="num">1</td></tr>
      </tbody>
    </table>
    </div>`);
  });

  it('einzug 6 verschiebt das Gerüst wie im Dashboard-Datenpunkte-Block', () => {
    const t = tabelle({ kopf: kopfzelle({ text: 'Objekt' }), zeilen: raw('<tr></tr>'), karten: true, einzug: 6 });
    expect(String(t)).toContain('      <div class="tabelle-scroll">\n      <table class="tabelle-karten">\n        <thead>');
  });
});
