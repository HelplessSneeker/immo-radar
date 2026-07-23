import { describe, expect, it } from 'vitest';
import { attr, html, join, klassen, LEER, raw } from '../src/pages/ui/html.js';

describe('html``', () => {
  it('escapet Text-Interpolationen (XSS-Payload)', () => {
    const boese = '<script>alert(1)</script>';
    expect(String(html`<p>${boese}</p>`)).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapet wie escapeHtml: & < > " – Single-Quote bleibt roh', () => {
    expect(String(html`${`Tom & "Jerry" <'s>`}`)).toBe('Tom &amp; &quot;Jerry&quot; &lt;\'s&gt;');
  });

  it('inlined raw() unverändert', () => {
    expect(String(html`<td>${raw('<b>fett</b>')}</td>`)).toBe('<td><b>fett</b></td>');
  });

  it('verschachteltes html`` wird nicht doppelt escaped', () => {
    const innen = html`<a href="/x">Tom &amp; Co</a>`;
    expect(String(html`<li>${innen}</li>`)).toBe('<li><a href="/x">Tom &amp; Co</a></li>');
  });

  it('Zahlen byte-genau, null/undefined/false zu Leerstring', () => {
    expect(String(html`${2.5}|${0}|${null}|${undefined}|${false}`)).toBe('2.5|0|||');
  });

  it('macht `bedingung && html``` natürlich', () => {
    const aktiv = false;
    expect(String(html`<div>${aktiv && html`<span>an</span>`}</div>`)).toBe('<div></div>');
  });
});

describe('join', () => {
  it('fügt Html roh, Strings escaped, Trenner roh zusammen', () => {
    const teile = [html`<i>a</i>`, 'b & c'];
    expect(String(join(teile, '\n      '))).toBe('<i>a</i>\n      b &amp; c');
  });

  it('Default-Trenner ist leer', () => {
    expect(String(join([raw('<a>'), raw('<b>')]))).toBe('<a><b>');
  });
});

describe('attr', () => {
  it('rendert mit führendem Leerzeichen und escapet den Wert', () => {
    expect(String(attr('placeholder', 'z. B. "9020"'))).toBe(' placeholder="z. B. &quot;9020&quot;"');
  });

  it('fällt bei null/undefined/false komplett weg', () => {
    expect(String(attr('inputmode', undefined))).toBe('');
    expect(String(attr('value', false))).toBe('');
  });

  it('nimmt Zahlen', () => {
    expect(String(attr('tabindex', 0))).toBe(' tabindex="0"');
  });
});

describe('klassen', () => {
  it('filtert Falsy und fügt mit Leerzeichen', () => {
    expect(klassen('feld', undefined, false, 'feld-plz')).toBe('feld feld-plz');
    expect(klassen('feld')).toBe('feld');
  });
});

describe('Html-Laufzeit-Caveats (dokumentiert in html.ts)', () => {
  it('LEER ist leer per length, aber truthy – deshalb nie `if (x)` prüfen', () => {
    expect(LEER.length).toBe(0);
    expect(Boolean(LEER)).toBe(true);
  });

  it('Html koerziert beim Interpolieren in gewöhnliche Template-Literale', () => {
    const fragment = html`<b>x</b>`;
    expect(`<p>${fragment}</p>`).toBe('<p><b>x</b></p>');
  });
});
