import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { behandleHealth } from '../src/health.js';

function fakeResponse(): { res: ServerResponse; status: () => number | undefined; body: () => string } {
  let status: number | undefined;
  let body = '';
  const res = {
    writeHead(s: number) {
      status = s;
      return this;
    },
    end(daten?: string) {
      body = daten ?? '';
    },
  } as unknown as ServerResponse;
  return { res, status: () => status, body: () => body };
}

describe('behandleHealth', () => {
  it('DB erreichbar: 200 mit status ok', async () => {
    const antwort = fakeResponse();
    await behandleHealth({ query: async () => [] }, antwort.res);
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'ok' });
  });

  it('DB-Fehler: 503 mit status db-unreachable', async () => {
    const antwort = fakeResponse();
    await behandleHealth(
      {
        query: async () => {
          throw new Error('connection refused');
        },
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(503);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'db-unreachable' });
  });
});
