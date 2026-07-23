import { describe, expect, it } from 'vitest';
import { html } from '../src/pages/ui/html.js';
import { leerZustand, metaHinweis, seitenkopf, sektion } from '../src/pages/ui/struktur.js';

describe('sektion', () => {
  it('rendert Top-Level-Block mit eigener 2-Space-Einrückung', () => {
    const s = sektion({ inhalt: html`    <p>x</p>` });
    expect(String(s)).toBe('  <section>\n    <p>x</p>\n  </section>');
  });

  it('rendert Klasse, id und h2-Titel in Ist-Reihenfolge', () => {
    const s = sektion({ titel: 'Filter', klasse: 'filter-sektion', id: 'datenpunkte', inhalt: html`    <p>x</p>` });
    expect(String(s)).toBe(
      '  <section class="filter-sektion" id="datenpunkte">\n    <h2>Filter</h2>\n    <p>x</p>\n  </section>',
    );
  });
});

describe('seitenkopf', () => {
  it('rendert h1 + optionale intro/meta in der Shape der bestehenden Header', () => {
    const kopf = seitenkopf({ ueberschrift: 'Top Picks', meta: html`Kauf-Objekte am Stichtag 07.07.2026` });
    expect(String(kopf)).toBe(
      '  <header>\n    <h1>Top Picks</h1>\n    <p class="meta">Kauf-Objekte am Stichtag 07.07.2026</p>\n  </header>',
    );
  });

  it('escapet die Überschrift', () => {
    expect(String(seitenkopf({ ueberschrift: '<b>X</b>' }))).toContain('<h1>&lt;b&gt;X&lt;/b&gt;</h1>');
  });
});

describe('metaHinweis / leerZustand', () => {
  it('metaHinweis rendert die leise Meta-Zeile', () => {
    expect(String(metaHinweis('Ohne Ausreißer gerechnet'))).toBe('<p class="meta">Ohne Ausreißer gerechnet</p>');
  });

  it('leerZustand folgt der renderOhneDatenSeite-Shape', () => {
    const s = leerZustand({ titel: 'Noch keine Daten', hinweis: 'Der erste Sweep steht noch aus.' });
    expect(String(s)).toBe(
      '  <section>\n    <h2>Noch keine Daten</h2>\n    <p class="meta">Der erste Sweep steht noch aus.</p>\n  </section>',
    );
  });
});
