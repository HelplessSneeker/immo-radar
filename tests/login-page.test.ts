import { describe, expect, it } from 'vitest';
import { renderLoginSeite } from '../src/pages/login-page.js';

describe('renderLoginSeite', () => {
  it('rendert Wortmarke, Titel und die zwei Felder', () => {
    const html = renderLoginSeite();
    expect(html).toContain('immo-radar');
    expect(html).toContain('<h1>Anmeldung</h1>');
    expect(html).toContain('name="benutzer"');
    expect(html).toContain('type="password"');
    expect(html).toContain('name="passwort"');
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('<button type="submit">Anmelden</button>');
  });

  it('postet auf /login und trägt den return-Pfad als hidden mit', () => {
    const html = renderLoginSeite({ returnPfad: '/portfolio' });
    expect(html).toContain('action="/login"');
    expect(html).toContain('method="post"');
    expect(html).toContain('name="return" value="/portfolio"');
  });

  it('rendert ohne Navbar (User ist nicht angemeldet)', () => {
    const html = renderLoginSeite();
    expect(html).not.toContain('class="hauptnav"');
    expect(html).not.toContain('href="/portfolio"');
  });

  it('nutzt die schmale 560px-Section wie Formulare (kein class="breit")', () => {
    const html = renderLoginSeite();
    expect(html).not.toContain('<main class="breit">');
    expect(html).toContain('<main>');
  });

  it('zeigt Fehlermeldung mit role="alert" bei fehlgeschlagenem Login', () => {
    const html = renderLoginSeite({ fehler: 'Benutzer oder Passwort falsch.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Benutzer oder Passwort falsch.');
    expect(html).toContain('anmeldung-fehler');
  });

  it('spiegelt den Benutzernamen bei Rerender zurück, das Passwort niemals', () => {
    const html = renderLoginSeite({
      fehler: 'Benutzer oder Passwort falsch.',
      benutzer: 'benjamin',
    });
    expect(html).toContain('name="benutzer" value="benjamin"');
    // Das Passwort-Feld hat keinen value-Attribut-Ausdruck.
    expect(html).not.toMatch(/name="passwort"[^>]*value=/);
  });

  it('escaped HTML in Benutzername und return-Pfad (kein XSS über Rerender)', () => {
    const html = renderLoginSeite({
      fehler: 'x',
      benutzer: '<script>alert(1)</script>',
      returnPfad: '/x"><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
