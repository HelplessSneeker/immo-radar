import { describe, expect, it } from 'vitest';
import { button, submitButton } from '../src/pages/ui/button.js';

describe('submitButton', () => {
  it('klein: class VOR type (Byte-Kontrakt der Filterleisten)', () => {
    expect(String(submitButton({ text: 'Filtern', klein: true }))).toBe(
      '<button class="klein" type="submit">Filtern</button>',
    );
  });

  it('ohne klein: kein class-Attribut (Byte-Kontrakt der Login-Seite)', () => {
    expect(String(submitButton({ text: 'Anmelden' }))).toBe('<button type="submit">Anmelden</button>');
  });
});

describe('button', () => {
  it('kritisch impliziert klein (BASIS_CSS stylt nur button.klein.kritisch)', () => {
    expect(String(button({ text: 'Löschen', typ: 'submit', variante: 'kritisch' }))).toBe(
      '<button class="klein kritisch" type="submit">Löschen</button>',
    );
  });

  it('deaktiviert rendert nacktes disabled, Text wird escaped', () => {
    expect(String(button({ text: '<b>x</b>', deaktiviert: true }))).toBe(
      '<button type="button" disabled>&lt;b&gt;x&lt;/b&gt;</button>',
    );
  });
});
