import { describe, expect, it } from 'vitest';
import { PortalFehler } from '../src/adapters/portal-adapter.js';
import { ladePortalSeite, type PortalSeiteKontext } from '../src/adapters/portal-seite.js';

class TestPortalFehler extends PortalFehler {}

const URL_ = () => new URL('https://portal.test/suche');

function kontext(
  fetchFn: typeof fetch,
  overrides: Partial<PortalSeiteKontext['retry']> = {},
): PortalSeiteKontext {
  return {
    fetchFn,
    host: 'portal.test',
    fehler: TestPortalFehler,
    retry: { maxVersuche: 3, basisPauseMs: 0, maxPauseMs: 0, warte: async () => {}, ...overrides },
  };
}

describe('ladePortalSeite', () => {
  it('liefert den Body der ersten erfolgreichen Antwort', async () => {
    const fetchFn = (async () => new Response('<html>ok</html>', { status: 200 })) as typeof fetch;
    await expect(ladePortalSeite(URL_(), kontext(fetchFn))).resolves.toBe('<html>ok</html>');
  });

  it('wiederholt einen Abbruch mitten im Body-Download', async () => {
    let aufrufe = 0;
    const fetchFn = (async () => {
      aufrufe += 1;
      if (aufrufe === 1) {
        const kaputt = new ReadableStream({
          start(controller) {
            controller.error(new Error('ECONNRESET mid-body'));
          },
        });
        return new Response(kaputt, { status: 200 });
      }
      return new Response('geladen', { status: 200 });
    }) as typeof fetch;
    await expect(ladePortalSeite(URL_(), kontext(fetchFn))).resolves.toBe('geladen');
    expect(aufrufe).toBe(2);
  });

  it('429 mit Retry-After: wartet die angegebene Zeit und wiederholt', async () => {
    const pausen: number[] = [];
    let aufrufe = 0;
    const fetchFn = (async () => {
      aufrufe += 1;
      if (aufrufe === 1) {
        return new Response('slow down', { status: 429, headers: { 'retry-after': '7' } });
      }
      return new Response('geladen', { status: 200 });
    }) as typeof fetch;
    const ergebnis = await ladePortalSeite(
      URL_(),
      kontext(fetchFn, { warte: async (ms) => void pausen.push(ms) }),
    );
    expect(ergebnis).toBe('geladen');
    expect(pausen).toEqual([7000]);
  });

  it('429 mit überlangem Retry-After: Pause wird bei 30 s gedeckelt', async () => {
    const pausen: number[] = [];
    let aufrufe = 0;
    const fetchFn = (async () => {
      aufrufe += 1;
      if (aufrufe === 1) {
        return new Response('slow down', { status: 429, headers: { 'retry-after': '600' } });
      }
      return new Response('geladen', { status: 200 });
    }) as typeof fetch;
    await ladePortalSeite(URL_(), kontext(fetchFn, { warte: async (ms) => void pausen.push(ms) }));
    expect(pausen).toEqual([30_000]);
  });

  it('429 ohne Retry-After: fail fast, kein weiterer Request in den Limiter', async () => {
    let aufrufe = 0;
    const fetchFn = (async () => {
      aufrufe += 1;
      return new Response('slow down', { status: 429 });
    }) as typeof fetch;
    await expect(ladePortalSeite(URL_(), kontext(fetchFn))).rejects.toThrow(/HTTP 429/);
    expect(aufrufe).toBe(1);
  });

  it('wirft die portal-spezifische Fehlerklasse mit Host in der Meldung', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const fehler = await ladePortalSeite(URL_(), kontext(offline)).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(TestPortalFehler);
    expect((fehler as Error).message).toContain('portal.test');
  });
});
