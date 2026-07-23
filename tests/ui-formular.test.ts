import { describe, expect, it } from 'vitest';
import {
  detailsFacette,
  fehlerHinweis,
  formular,
  optionen,
  passwortFeld,
  selectFeld,
  textFeld,
  versteckt,
  vonBisFeld,
} from '../src/pages/ui/formular.js';
import { html } from '../src/pages/ui/html.js';

describe('formular', () => {
  it('rendert method VOR action, Inhalt als roher Slot', () => {
    const f = formular({ methode: 'post', aktion: '/login', inhalt: html`
      <p>x</p>` });
    expect(String(f)).toBe('    <form method="post" action="/login">\n      <p>x</p>\n    </form>');
  });
});

describe('textFeld (umschlag fieldset) / passwortFeld', () => {
  it('rendert das Login-Benutzerfeld byte-genau inkl. required/autofocus', () => {
    const feld = textFeld({
      id: 'l-benutzer',
      name: 'benutzer',
      label: 'Benutzer',
      wert: 'benjamin',
      umschlag: 'fieldset',
      autovervollstaendigen: 'username',
      erforderlich: true,
      autofokus: true,
    });
    expect(String(feld)).toBe(`<fieldset>
        <label class="feld" for="l-benutzer">Benutzer</label>
        <input type="text" id="l-benutzer" name="benutzer" value="benjamin" autocomplete="username" required autofocus>
      </fieldset>`);
  });

  it('passwortFeld lässt das value-Attribut KOMPLETT weg', () => {
    const feld = passwortFeld({
      id: 'l-passwort',
      name: 'passwort',
      label: 'Passwort',
      umschlag: 'fieldset',
      autovervollstaendigen: 'current-password',
      erforderlich: true,
    });
    expect(String(feld)).toContain(
      '<input type="password" id="l-passwort" name="passwort" autocomplete="current-password" required>',
    );
    expect(String(feld)).not.toMatch(/name="passwort"[^>]*value=/);
  });

  it('escapet den zurückgespiegelten Wert', () => {
    const feld = textFeld({ id: 'x', name: 'x', label: 'X', wert: '<script>alert(1)</script>' });
    expect(String(feld)).toContain('value="&lt;script&gt;alert(1)&lt;/script&gt;"');
  });
});

describe('selectFeld / optionen', () => {
  it('markiert die aktive Option mit nacktem selected', () => {
    expect(String(optionen([['', 'alle Heizungen'], ['Fernwärme', 'Fernwärme'], ['Gasheizung', 'Gasheizung']], 'Fernwärme'))).toBe(
      '<option value="">alle Heizungen</option><option value="Fernwärme" selected>Fernwärme</option><option value="Gasheizung">Gasheizung</option>',
    );
  });

  it('rendert das Feld-Gerüst byte-genau', () => {
    const feld = selectFeld({ id: 'f-typ', name: 'typ', label: 'Typ', optionen: [['', 'Kauf & Miete']] });
    expect(String(feld)).toBe(`<div class="feld">
        <label for="f-typ">Typ</label>
        <select id="f-typ" name="typ"><option value="" selected>Kauf &amp; Miete</option></select>
      </div>`);
  });
});

describe('vonBisFeld', () => {
  it('rendert Zahlen-Bereiche byte-genau (2.5 bleibt 2.5, value immer gesetzt)', () => {
    const feld = vonBisFeld({
      legend: 'Zimmer',
      klasse: 'feld-zimmer',
      von: { id: 'f-zimmer-min', name: 'zimmer_min', inputmode: 'decimal', wert: 2.5, platzhalter: 'von', ariaLabel: 'Zimmer von' },
      bis: { id: 'f-zimmer-max', name: 'zimmer_max', inputmode: 'decimal', wert: undefined, platzhalter: 'bis', ariaLabel: 'Zimmer bis' },
    });
    expect(String(feld)).toBe(`<fieldset class="feld feld-zimmer">
        <legend>Zimmer</legend>
        <div class="von-bis">
          <input type="text" id="f-zimmer-min" name="zimmer_min" inputmode="decimal" value="2.5" placeholder="von" aria-label="Zimmer von">
          <input type="text" id="f-zimmer-max" name="zimmer_max" inputmode="decimal" value="" placeholder="bis" aria-label="Zimmer bis">
        </div>
      </fieldset>`);
  });

  it('Datums-Variante ohne inputmode/placeholder', () => {
    const feld = vonBisFeld({
      legend: 'Eigener Zeitraum',
      typ: 'date',
      von: { id: 'f-von', name: 'von', wert: '2026-06-24', ariaLabel: 'Von (Datum)' },
      bis: { id: 'f-bis', name: 'bis', wert: '', ariaLabel: 'Bis (Datum)' },
    });
    expect(String(feld)).toContain('<input type="date" id="f-von" name="von" value="2026-06-24" aria-label="Von (Datum)">');
  });
});

describe('detailsFacette', () => {
  it('rendert class VOR open (Attribut-Reihenfolge lastentragend)', () => {
    const zu = detailsFacette({ summary: 'Ausstattung', inhalt: html`<div>x</div>` });
    expect(String(zu)).toContain('<details class="feld-ausstattung">\n        <summary>Ausstattung</summary>');
    const auf = detailsFacette({ summary: 'Ausstattung: 1 gewählt', offen: true, inhalt: html`<div>x</div>` });
    expect(String(auf)).toContain('<details class="feld-ausstattung" open>');
    expect(String(auf)).toContain('<summary>Ausstattung: 1 gewählt</summary>');
  });
});

describe('versteckt / fehlerHinweis', () => {
  it('versteckt rendert das Hidden-Feld byte-genau', () => {
    expect(String(versteckt('return', '/portfolio'))).toBe('<input type="hidden" name="return" value="/portfolio">');
  });

  it('fehlerHinweis: Default-Klasse feld-fehler, überschreibbar, escapet Text', () => {
    expect(String(fehlerHinweis({ text: 'Pflichtfeld' }))).toBe('<p class="feld-fehler" role="alert">Pflichtfeld</p>');
    expect(String(fehlerHinweis({ text: 'Benutzer <böse>', klasse: 'anmeldung-fehler' }))).toBe(
      '<p class="anmeldung-fehler" role="alert">Benutzer &lt;böse&gt;</p>',
    );
  });
});
