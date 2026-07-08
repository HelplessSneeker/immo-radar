import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruefeAuth, signiereSitzung } from '../src/auth.js';

/** Fake-Response, die writeHead/end-Aufrufe mitschreibt. */
interface FakeResponse {
  res: ServerResponse;
  status: number | undefined;
  headers: Record<string, string>;
  setCookies: string[];
}

function fakeResponse(): FakeResponse {
  const aufzeichnung: FakeResponse = {
    status: undefined,
    headers: {},
    setCookies: [],
    res: undefined as unknown as ServerResponse,
  };
  const kopfSpeicher: Record<string, string | string[]> = {};
  aufzeichnung.res = {
    writeHead(status: number, headers?: Record<string, string>) {
      aufzeichnung.status = status;
      Object.assign(aufzeichnung.headers, headers);
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

function fakeRequest(cookie?: string): IncomingMessage {
  return { headers: cookie === undefined ? {} : { cookie } } as IncomingMessage;
}

const ENV_VORHER = {
  user: process.env.BASIC_AUTH_USER,
  pass: process.env.BASIC_AUTH_PASS,
  secret: process.env.SESSION_SECRET,
};

const TEST_SECRET = 'test-geheimnis-mit-mehr-als-32-zeichen-zufall';

describe('pruefeAuth', () => {
  beforeEach(() => {
    process.env.BASIC_AUTH_USER = 'radar';
    process.env.BASIC_AUTH_PASS = 'geheimes-passwort';
    process.env.SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(ENV_VORHER) as ['user' | 'pass' | 'secret', string | undefined][]) {
      const name = k === 'user' ? 'BASIC_AUTH_USER' : k === 'pass' ? 'BASIC_AUTH_PASS' : 'SESSION_SECRET';
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  });

  it('gültiges Session-Cookie: true, keine Antwort gesendet', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    const antwort = fakeResponse();
    const ok = pruefeAuth(fakeRequest(`sitzung=${cookie}`), antwort.res, '/');
    expect(ok).toBe(true);
    expect(antwort.status).toBeUndefined();
  });

  function erwarteLoginRedirect(cookie: string | undefined, pfad = '/portfolio'): FakeResponse {
    const antwort = fakeResponse();
    const ok = pruefeAuth(fakeRequest(cookie), antwort.res, pfad);
    expect(ok).toBe(false);
    expect(antwort.status).toBe(303);
    return antwort;
  }

  it('fehlendes Cookie: 303 auf /login mit return-Pfad', () => {
    const antwort = erwarteLoginRedirect(undefined, '/portfolio');
    expect(antwort.headers.location).toBe(`/login?return=${encodeURIComponent('/portfolio')}`);
  });

  it('return-Pfad wird URL-encoded (Query und Sonderzeichen)', () => {
    const antwort = erwarteLoginRedirect(undefined, '/inserate?seite=3&sortierung=miete');
    expect(antwort.headers.location).toBe(
      `/login?return=${encodeURIComponent('/inserate?seite=3&sortierung=miete')}`,
    );
  });

  it('kaputte Signatur: 303 auf /login', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    const manipuliert = `${cookie.slice(0, -3)}xyz`;
    erwarteLoginRedirect(`sitzung=${manipuliert}`);
  });

  it('Cookie mit anderem Geheimnis signiert: 303', () => {
    const cookie = signiereSitzung('radar', 'anderes-geheimnis-mindestens-32-zeichen-zufall');
    erwarteLoginRedirect(`sitzung=${cookie}`);
  });

  it('abgelaufene Sitzung (>30 Tage alt): 303', () => {
    const vor31Tagen = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const cookie = signiereSitzung('radar', TEST_SECRET, vor31Tagen);
    erwarteLoginRedirect(`sitzung=${cookie}`);
  });

  it('SESSION_SECRET fehlt: fail-closed 303', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    delete process.env.SESSION_SECRET;
    erwarteLoginRedirect(`sitzung=${cookie}`);
  });

  it('fremde Cookies neben sitzung: gültige Sitzung wird erkannt', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    const antwort = fakeResponse();
    const ok = pruefeAuth(
      fakeRequest(`theme=dark; sitzung=${cookie}; other=1`),
      antwort.res,
      '/',
    );
    expect(ok).toBe(true);
    expect(antwort.status).toBeUndefined();
  });

  it('Cookie älter als Sliding-Intervall: gültig und wird erneuert', () => {
    const vor2Tagen = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const cookie = signiereSitzung('radar', TEST_SECRET, vor2Tagen);
    const antwort = fakeResponse();
    const ok = pruefeAuth(fakeRequest(`sitzung=${cookie}`), antwort.res, '/');
    expect(ok).toBe(true);
    expect(antwort.setCookies).toHaveLength(1);
    expect(antwort.setCookies[0]).toMatch(/^sitzung=/);
    expect(antwort.setCookies[0]).toContain('HttpOnly');
    expect(antwort.setCookies[0]).toContain('SameSite=Lax');
  });

  it('frisches Cookie: kein unnötiger Sliding-Refresh', () => {
    const cookie = signiereSitzung('radar', TEST_SECRET);
    const antwort = fakeResponse();
    pruefeAuth(fakeRequest(`sitzung=${cookie}`), antwort.res, '/');
    expect(antwort.setCookies).toHaveLength(0);
  });
});
