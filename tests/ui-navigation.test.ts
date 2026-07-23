import { describe, expect, it } from 'vitest';
import { seitenNav } from '../src/pages/ui/navigation.js';

describe('seitenNav', () => {
  it('rendert die Ist-Shape von /inserate byte-genau (Einzug 4)', () => {
    const nav = seitenNav({
      label: 'Seiten',
      zaehler: 'Seite 2 von 3 · 120 Inserate',
      zurueck: { href: '/inserate?nur=ausreisser&seite=1', text: '← Zurück' },
      weiter: { href: '/inserate?nur=ausreisser&seite=3', text: 'Weiter →' },
    });
    expect(String(nav)).toBe(`    <nav class="seiten-nav" aria-label="Seiten">
      <a href="/inserate?nur=ausreisser&seite=1">← Zurück</a>
      <span class="meta zaehler">Seite 2 von 3 · 120 Inserate</span>
      <a href="/inserate?nur=ausreisser&seite=3">Weiter →</a>
    </nav>`);
  });

  it('hält am Rand die Ausrichtung mit leerem <span> (Einzug 6)', () => {
    const nav = seitenNav({
      label: 'Stichtag wählen',
      einzug: 6,
      zaehler: 'Stichtag 1 von 3',
      weiter: { href: '/?stichtag=2026-07-07', text: 'neuerer Stichtag →' },
    });
    expect(String(nav)).toBe(`      <nav class="seiten-nav" aria-label="Stichtag wählen">
        <span></span>
        <span class="meta zaehler">Stichtag 1 von 3</span>
        <a href="/?stichtag=2026-07-07">neuerer Stichtag →</a>
      </nav>`);
  });

  it('lässt das nackte & in hrefs roh (Ist-Verhalten), escapet aber den Linktext', () => {
    const nav = seitenNav({
      label: 'Seiten',
      zaehler: 'Seite 1 von 2',
      weiter: { href: '/?a=1&b=2', text: '<Weiter>' },
    });
    expect(String(nav)).toContain('href="/?a=1&b=2"');
    expect(String(nav)).toContain('>&lt;Weiter&gt;</a>');
  });
});
