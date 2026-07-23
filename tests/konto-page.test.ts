import { describe, expect, it } from 'vitest';

process.env.BASIC_AUTH_USER = 'radar';

const { renderKontoSeite } = await import('../src/pages/konto-page.js');

describe('renderKontoSeite', () => {
  const html = renderKontoSeite();

  it('rendert den Stub mit Kopf und In-Arbeit-Hinweis', () => {
    expect(html).toContain('<h1>Konto</h1>');
    expect(html).toContain('Konto-Verwaltung kommt mit dem Anmelde-Zyklus.');
  });

  it('markiert keinen Nav-Eintrag als aktiv', () => {
    // Mit führendem Leerzeichen: das Markup-Attribut, nicht der
    // CSS-Selektor a[aria-current="page"] im <style>-Block.
    expect(html).not.toContain(' aria-current="page"');
  });

  it('zeigt den Benutzer-Slot der Seitenleiste', () => {
    expect(html).toContain('href="/konto"');
    expect(html).toContain('<span class="konto-name">radar</span>');
  });
});
