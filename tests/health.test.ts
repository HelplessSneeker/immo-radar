import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { behandleHealth, paketVersion } from '../src/health.js';

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
  it('DB erreichbar, angemeldet: 200 mit status ok und Version', async () => {
    const antwort = fakeResponse();
    await behandleHealth(
      { pool: { query: async () => [] }, version: '1.2.3', angemeldet: true },
      antwort.res,
    );
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'ok', version: '1.2.3' });
  });

  it('anonym: nur status ok — keine Version, kein Sweep (kein Info-Leak)', async () => {
    const antwort = fakeResponse();
    const beendet = new Date('2026-07-08T05:23:12.000Z');
    await behandleHealth(
      {
        pool: { query: async () => [] },
        version: '1.2.3',
        angemeldet: false,
        letzterSweep: async () => ({ laufDatum: '2026-07-08', beendetAm: beendet }),
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'ok' });
  });

  it('DB-Fehler: 503 mit status db-unreachable (kein Info-Leak)', async () => {
    const antwort = fakeResponse();
    await behandleHealth(
      {
        pool: {
          query: async () => {
            throw new Error('connection refused');
          },
        },
        version: '1.2.3',
        angemeldet: true,
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(503);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'db-unreachable' });
  });

  it('hängender DB-Check: Deckel greift, 503 db-unreachable', async () => {
    const antwort = fakeResponse();
    // Der Pool ist gesättigt — SELECT 1 löst nie auf, /health darf nicht hängen.
    await behandleHealth(
      {
        pool: { query: () => new Promise(() => {}) },
        version: '1.2.3',
        angemeldet: true,
        dbTimeoutMs: 10,
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(503);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'db-unreachable' });
  });

  it('mit letzterSweep-Lookup: liefert Lauf-Datum und ISO-Timestamp', async () => {
    const antwort = fakeResponse();
    const beendet = new Date('2026-07-08T05:23:12.000Z');
    await behandleHealth(
      {
        pool: { query: async () => [] },
        version: '1.2.3',
        angemeldet: true,
        letzterSweep: async () => ({ laufDatum: '2026-07-08', beendetAm: beendet }),
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({
      status: 'ok',
      version: '1.2.3',
      letzterSweep: { laufDatum: '2026-07-08', beendetAm: '2026-07-08T05:23:12.000Z' },
    });
  });

  it('ohne bisherigen Sweep: letzterSweep-Feld bleibt weg', async () => {
    const antwort = fakeResponse();
    await behandleHealth(
      {
        pool: { query: async () => [] },
        version: '1.2.3',
        angemeldet: true,
        letzterSweep: async () => undefined,
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'ok', version: '1.2.3' });
  });

  it('Fehler in der Sweep-Abfrage: /health bleibt 200, Feld weggelassen', async () => {
    const antwort = fakeResponse();
    await behandleHealth(
      {
        pool: { query: async () => [] },
        version: '1.2.3',
        angemeldet: true,
        letzterSweep: async () => {
          throw new Error('sweep-tabelle weg');
        },
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'ok', version: '1.2.3' });
  });

  it('hängende Sweep-Abfrage: Timeout greift, /health antwortet ohne Sweep-Feld', async () => {
    const antwort = fakeResponse();
    // letzterSweep löst nie auf — Race gegen den Timeout muss den Timeout wählen.
    await behandleHealth(
      {
        pool: { query: async () => [] },
        version: '1.2.3',
        angemeldet: true,
        letzterSweep: () => new Promise(() => {}),
        letzterSweepTimeoutMs: 10,
      },
      antwort.res,
    );
    expect(antwort.status()).toBe(200);
    expect(JSON.parse(antwort.body())).toEqual({ status: 'ok', version: '1.2.3' });
  });
});

describe('paketVersion', () => {
  it('liest die Version aus package.json', () => {
    const version = paketVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
