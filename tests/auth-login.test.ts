import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  pruefeSitzung,
  sichererReturnPfad,
  signiereSitzung,
  verarbeiteLogin,
} from '../src/auth.js';

interface FakeResponse {
  res: ServerResponse;
  setCookies: string[];
}

function fakeResponse(): FakeResponse {
  const kopfSpeicher: Record<string, string | string[]> = {};
  const aufzeichnung: FakeResponse = {
    setCookies: [],
    res: undefined as unknown as ServerResponse,
  };
  aufzeichnung.res = {
    writeHead() {
      return this;
    },
    end() {},
    setHeader(name: string, value: string | string[]) {
      kopfSpeicher[name.toLowerCase()] = value;
      if (name.toLowerCase() === 'set-cookie') {
        aufzeichnung.setCookies = Array.isArray(value) ? value.map(String) : [String(value)];
      }
    },
    getHeader(name: string) {
      return kopfSpeicher[name.toLowerCase()];
    },
  } as unknown as ServerResponse;
  return aufzeichnung;
}

const ENV_VORHER = {
  user: process.env.BASIC_AUTH_USER,
  pass: process.env.BASIC_AUTH_PASS,
  secret: process.env.SESSION_SECRET,
  node: process.env.NODE_ENV,
};

const TEST_SECRET = 'test-geheimnis-mit-mehr-als-32-zeichen-zufall';

function stelleEnvWiederHer(): void {
  for (const [k, v] of Object.entries(ENV_VORHER) as [
    keyof typeof ENV_VORHER,
    string | undefined,
  ][]) {
    const name =
      k === 'user'
        ? 'BASIC_AUTH_USER'
        : k === 'pass'
          ? 'BASIC_AUTH_PASS'
          : k === 'secret'
            ? 'SESSION_SECRET'
            : 'NODE_ENV';
    if (v === undefined) delete process.env[name];
    else process.env[name] = v;
  }
}

describe('verarbeiteLogin', () => {
  beforeEach(() => {
    process.env.BASIC_AUTH_USER = 'radar';
    process.env.BASIC_AUTH_PASS = 'geheimes-passwort';
    process.env.SESSION_SECRET = TEST_SECRET;
    delete process.env.NODE_ENV;
  });

  afterEach(stelleEnvWiederHer);

  it('gültige Credentials: erfolg + Ziel + Session-Cookie gesetzt', () => {
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin(
      'benutzer=radar&passwort=geheimes-passwort&return=/portfolio',
      antwort.res,
    );
    expect(ergebnis).toEqual({ erfolg: true, ziel: '/portfolio' });
    expect(antwort.setCookies).toHaveLength(1);
    const cookie = antwort.setCookies[0]!;
    expect(cookie).toMatch(/^sitzung=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    // In Nicht-Prod ist Secure nicht gesetzt (verhindert HTTP-Sackgassen im Dev).
    expect(cookie).not.toContain('Secure');
  });

  it('Cookie ist mit SESSION_SECRET verifizierbar (Roundtrip)', () => {
    const antwort = fakeResponse();
    verarbeiteLogin('benutzer=radar&passwort=geheimes-passwort', antwort.res);
    const wert = antwort.setCookies[0]!.split(';')[0]!.replace(/^sitzung=/, '');
    const geprueft = pruefeSitzung(wert, TEST_SECRET);
    expect(geprueft.ok).toBe(true);
    if (geprueft.ok) expect(geprueft.benutzer).toBe('radar');
  });

  it('in Prod: Cookie trägt das Secure-Flag', () => {
    process.env.NODE_ENV = 'production';
    const antwort = fakeResponse();
    verarbeiteLogin('benutzer=radar&passwort=geheimes-passwort', antwort.res);
    expect(antwort.setCookies[0]).toContain('Secure');
  });

  it('falsches Passwort: Fehler mit gespiegeltem Benutzer, kein Cookie', () => {
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin('benutzer=radar&passwort=falsch', antwort.res);
    expect(ergebnis).toEqual({ erfolg: false, benutzer: 'radar', returnPfad: '/' });
    expect(antwort.setCookies).toHaveLength(0);
  });

  it('unbekannter Benutzer: Fehler, kein Cookie', () => {
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin(
      'benutzer=eindringling&passwort=geheimes-passwort',
      antwort.res,
    );
    expect(ergebnis).toEqual({ erfolg: false, benutzer: 'eindringling', returnPfad: '/' });
    expect(antwort.setCookies).toHaveLength(0);
  });

  it('leere Felder: Fehler', () => {
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin('benutzer=&passwort=', antwort.res);
    expect(ergebnis.erfolg).toBe(false);
    if (!ergebnis.erfolg) expect(ergebnis.benutzer).toBe('');
    expect(antwort.setCookies).toHaveLength(0);
  });

  it('unsicherer return (protokoll-relativ): fällt auf /', () => {
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin(
      'benutzer=radar&passwort=geheimes-passwort&return=//attacker.example/steal',
      antwort.res,
    );
    expect(ergebnis).toEqual({ erfolg: true, ziel: '/' });
  });

  it('unsicherer return (kompletter URL): fällt auf /', () => {
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin(
      'benutzer=radar&passwort=geheimes-passwort&return=https://attacker.example',
      antwort.res,
    );
    expect(ergebnis).toEqual({ erfolg: true, ziel: '/' });
  });

  it('SESSION_SECRET fehlt: Fehler, kein Cookie', () => {
    delete process.env.SESSION_SECRET;
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin(
      'benutzer=radar&passwort=geheimes-passwort',
      antwort.res,
    );
    expect(ergebnis.erfolg).toBe(false);
    expect(antwort.setCookies).toHaveLength(0);
  });

  it('BASIC_AUTH_* fehlen: fail-closed, keine Anmeldung', () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASS;
    const antwort = fakeResponse();
    const ergebnis = verarbeiteLogin('benutzer=&passwort=', antwort.res);
    expect(ergebnis.erfolg).toBe(false);
    expect(antwort.setCookies).toHaveLength(0);
  });
});

describe('sichererReturnPfad', () => {
  it('leerer/fehlender Wert → /', () => {
    expect(sichererReturnPfad(undefined)).toBe('/');
    expect(sichererReturnPfad(null)).toBe('/');
    expect(sichererReturnPfad('')).toBe('/');
  });

  it('eigener Pfad bleibt erhalten (inkl. Query)', () => {
    expect(sichererReturnPfad('/portfolio')).toBe('/portfolio');
    expect(sichererReturnPfad('/inserate?seite=3')).toBe('/inserate?seite=3');
  });

  it('protokoll-relative Pfade werden verworfen', () => {
    expect(sichererReturnPfad('//example.com/x')).toBe('/');
    expect(sichererReturnPfad('/\\example.com/x')).toBe('/');
  });

  it('komplette URLs werden verworfen', () => {
    expect(sichererReturnPfad('https://example.com/x')).toBe('/');
    expect(sichererReturnPfad('javascript:alert(1)')).toBe('/');
  });
});

describe('pruefeSitzung', () => {
  it('erkennt die eigene Signatur', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    const geprueft = pruefeSitzung(cookie, TEST_SECRET);
    expect(geprueft.ok).toBe(true);
  });

  it('lehnt manipulierten Payload ab', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    const [_payload, sig] = cookie.split('.');
    const boesePayload = Buffer.from(JSON.stringify({ u: 'root', iat: Date.now() }))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const geprueft = pruefeSitzung(`${boesePayload}.${sig}`, TEST_SECRET);
    expect(geprueft.ok).toBe(false);
  });

  it('lehnt Cookies aus der Zukunft ab', () => {
    const inZukunft = Date.now() + 5 * 60 * 1000;
    const cookie = signiereSitzung('radar', TEST_SECRET, inZukunft);
    const geprueft = pruefeSitzung(cookie, TEST_SECRET);
    expect(geprueft.ok).toBe(false);
  });

  it('lehnt Cookie ohne Punkt ab', () => {
    expect(pruefeSitzung('kein-punkt', TEST_SECRET).ok).toBe(false);
  });
});
