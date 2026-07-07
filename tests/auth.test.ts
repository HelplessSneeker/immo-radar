import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruefeAuth } from '../src/auth.js';

/** Fake-Response, die writeHead/end-Aufrufe mitschreibt. */
interface FakeResponse {
  res: ServerResponse;
  status: number | undefined;
  headers: Record<string, string>;
}

function fakeResponse(): FakeResponse {
  const aufzeichnung: FakeResponse = {
    status: undefined,
    headers: {},
    res: undefined as unknown as ServerResponse,
  };
  aufzeichnung.res = {
    writeHead(status: number, headers?: Record<string, string>) {
      aufzeichnung.status = status;
      Object.assign(aufzeichnung.headers, headers);
      return this;
    },
    end() {},
  } as unknown as ServerResponse;
  return aufzeichnung;
}

function fakeRequest(authorization?: string): IncomingMessage {
  return { headers: authorization === undefined ? {} : { authorization } } as IncomingMessage;
}

function basicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

const ENV_VORHER = {
  user: process.env.BASIC_AUTH_USER,
  pass: process.env.BASIC_AUTH_PASS,
};

describe('pruefeAuth', () => {
  beforeEach(() => {
    process.env.BASIC_AUTH_USER = 'radar';
    process.env.BASIC_AUTH_PASS = 'geheimes-passwort';
  });

  afterEach(() => {
    if (ENV_VORHER.user === undefined) delete process.env.BASIC_AUTH_USER;
    else process.env.BASIC_AUTH_USER = ENV_VORHER.user;
    if (ENV_VORHER.pass === undefined) delete process.env.BASIC_AUTH_PASS;
    else process.env.BASIC_AUTH_PASS = ENV_VORHER.pass;
  });

  it('gültige Credentials: true, keine Antwort gesendet', () => {
    const antwort = fakeResponse();
    const ok = pruefeAuth(fakeRequest(basicHeader('radar', 'geheimes-passwort')), antwort.res);
    expect(ok).toBe(true);
    expect(antwort.status).toBeUndefined();
  });

  function erwarte401(authorization?: string): void {
    const antwort = fakeResponse();
    const ok = pruefeAuth(fakeRequest(authorization), antwort.res);
    expect(ok).toBe(false);
    expect(antwort.status).toBe(401);
    expect(antwort.headers['www-authenticate']).toBe('Basic realm="immo-radar"');
  }

  it('fehlender Header: 401 mit WWW-Authenticate', () => {
    erwarte401();
  });

  it('falscher User: 401', () => {
    erwarte401(basicHeader('eindringling', 'geheimes-passwort'));
  });

  it('falsches Passwort: 401', () => {
    erwarte401(basicHeader('radar', 'falsch'));
  });

  it('Credentials ohne Doppelpunkt (kaputtes Base64): 401', () => {
    erwarte401(`Basic ${Buffer.from('kein-doppelpunkt').toString('base64')}`);
  });

  it('falsches Schema (Bearer): 401', () => {
    erwarte401('Bearer irgendein-token');
  });

  it('Passwort als Präfix des echten reicht nicht: 401', () => {
    erwarte401(basicHeader('radar', 'geheimes-pass'));
  });

  it('fehlende Env-Vars: fail-closed 401 auch mit korrekt formatiertem Header', () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASS;
    erwarte401(basicHeader('radar', 'geheimes-passwort'));
  });
});
