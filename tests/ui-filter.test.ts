import { describe, expect, it } from 'vitest';
import { filterLeiste } from '../src/pages/ui/filter.js';
import { checkboxFeld, textFeld, versteckt } from '../src/pages/ui/formular.js';
import { html, LEER, raw } from '../src/pages/ui/html.js';

describe('filterLeiste', () => {
  it('reproduziert das Dashboard-Gerüst mit Hidden-Feld byte-genau (Test-Kontrakt der Seitentests)', () => {
    const leiste = filterLeiste({
      aktion: '/',
      felder: [versteckt('stichtag', '2026-07-07')],
    });
    // Exakt der Substring, den tests/dashboard-page.test.ts asserted.
    expect(String(leiste)).toContain(
      '<form class="filterleiste" method="get" action="/">\n      <input type="hidden" name="stichtag" value="2026-07-07">',
    );
    expect(String(leiste)).toContain('\n      <button class="klein" type="submit">Filtern</button>\n    </form>');
  });

  it('überspringt LEER/false/undefined-Felder ohne Whitespace-Rest', () => {
    const leiste = filterLeiste({
      aktion: '/inserate',
      felder: [LEER, false, undefined, raw('<div class="feld">x</div>')],
    });
    expect(String(leiste)).toContain('action="/inserate">\n      <div class="feld">x</div>\n      <button');
  });

  it('rendert Reset-Zeile nur mit zuruecksetzenHref, extra nach </form>', () => {
    const mit = filterLeiste({
      aktion: '/top-picks',
      felder: [],
      zuruecksetzenHref: '/top-picks',
      extra: html`
    <p class="meta">Hinweis.</p>`,
    });
    expect(String(mit)).toContain(
      '</button>\n      <p class="meta"><a href="/top-picks">Filter zurücksetzen</a></p>\n    </form>\n    <p class="meta">Hinweis.</p>',
    );
    const ohne = filterLeiste({ aktion: '/', felder: [] });
    expect(String(ohne)).not.toContain('Filter zurücksetzen');
    expect(String(ohne)).toContain('</button>\n    </form>');
  });
});

describe('checkboxFeld', () => {
  it('rendert den feld-toggle-Block mit Hinweis-Zeile byte-genau', () => {
    const feld = checkboxFeld({
      name: 'ausreisser',
      wert: 'an',
      label: 'Ausreißer einbeziehen',
      checked: false,
      hinweis: html`<a href="/methodik#ausreisser">Was zählt als Ausreißer?</a>`,
    });
    expect(String(feld)).toBe(`<div class="feld feld-toggle">
        <label><input type="checkbox" name="ausreisser" value="an"> Ausreißer einbeziehen</label>
        <p class="meta"><a href="/methodik#ausreisser">Was zählt als Ausreißer?</a></p>
      </div>`);
  });

  it('setzt checked als nacktes Attribut', () => {
    const feld = checkboxFeld({ name: 'nur', wert: 'ausreisser', label: 'Nur Ausreißer', checked: true });
    expect(String(feld)).toContain('name="nur" value="ausreisser" checked> Nur Ausreißer');
  });
});

describe('textFeld im Filter-Kontext', () => {
  it('rendert das PLZ-Feld byte-genau (Attribut-Reihenfolge type,id,name,inputmode,value,placeholder)', () => {
    const feld = textFeld({
      id: 'f-plz',
      name: 'plz',
      label: 'PLZ (Anfang genügt)',
      klasse: 'feld-plz',
      inputmode: 'numeric',
      wert: '9020',
      platzhalter: 'z. B. 9020 oder 95',
    });
    expect(String(feld)).toBe(`<div class="feld feld-plz">
        <label for="f-plz">PLZ (Anfang genügt)</label>
        <input type="text" id="f-plz" name="plz" inputmode="numeric" value="9020" placeholder="z. B. 9020 oder 95">
      </div>`);
  });
});
