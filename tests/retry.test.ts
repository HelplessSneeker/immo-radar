import { describe, expect, it } from 'vitest';
import {
  WIEDERHOLBARE_STATUS,
  istWiederholbar,
  markiereWiederholbar,
  mitRetry,
  type RetryOptionen,
} from '../src/retry.js';

/** Retry-Optionen ohne echte Wartezeiten und mit deterministischem Jitter. */
function optionen(overrides: Partial<RetryOptionen> = {}): RetryOptionen {
  return {
    maxVersuche: 3,
    basisPauseMs: 100,
    maxPauseMs: 400,
    warte: async () => {},
    jitter: () => 1,
    ...overrides,
  };
}

describe('markiereWiederholbar / istWiederholbar', () => {
  it('markiert einen Fehler und erkennt ihn wieder', () => {
    const fehler = markiereWiederholbar(new Error('transient'));
    expect(istWiederholbar(fehler)).toBe(true);
  });

  it('nicht-markierte Fehler und Nicht-Objekte gelten als persistent', () => {
    expect(istWiederholbar(new Error('nope'))).toBe(false);
    expect(istWiederholbar('string')).toBe(false);
    expect(istWiederholbar(null)).toBe(false);
  });
});

describe('mitRetry', () => {
  it('liefert das Ergebnis des ersten erfolgreichen Versuchs', async () => {
    let aufrufe = 0;
    const ergebnis = await mitRetry(async () => {
      aufrufe += 1;
      return 42;
    }, optionen());
    expect(ergebnis).toBe(42);
    expect(aufrufe).toBe(1);
  });

  it('wiederholt markierte Fehler bis zum Erfolg', async () => {
    let aufrufe = 0;
    const ergebnis = await mitRetry(async () => {
      aufrufe += 1;
      if (aufrufe < 3) throw markiereWiederholbar(new Error(`versuch ${aufrufe}`));
      return 'ok';
    }, optionen());
    expect(ergebnis).toBe('ok');
    expect(aufrufe).toBe(3);
  });

  it('wirft persistente Fehler sofort ohne Wiederholung', async () => {
    let aufrufe = 0;
    await expect(
      mitRetry(async () => {
        aufrufe += 1;
        throw new Error('persistent');
      }, optionen()),
    ).rejects.toThrow('persistent');
    expect(aufrufe).toBe(1);
  });

  it('wirft nach maxVersuche den zuletzt gefangenen Fehler', async () => {
    let aufrufe = 0;
    await expect(
      mitRetry(async () => {
        aufrufe += 1;
        throw markiereWiederholbar(new Error(`versuch ${aufrufe}`));
      }, optionen({ maxVersuche: 3 })),
    ).rejects.toThrow('versuch 3');
    expect(aufrufe).toBe(3);
  });

  it('deckelt die Backoff-Pause bei maxPauseMs', async () => {
    const pausen: number[] = [];
    let aufrufe = 0;
    await expect(
      mitRetry(
        async () => {
          aufrufe += 1;
          throw markiereWiederholbar(new Error('boom'));
        },
        optionen({
          maxVersuche: 5,
          basisPauseMs: 100,
          maxPauseMs: 250,
          jitter: () => 1, // volle Pause
          warte: async (ms) => {
            pausen.push(ms);
          },
        }),
      ),
    ).rejects.toThrow();
    // 4 Pausen (nach Versuch 1..4): 100, 200, 250 (deckelt ab), 250
    expect(pausen).toEqual([100, 200, 250, 250]);
    expect(aufrufe).toBe(5);
  });

  it('respektiert eine eigene wiederholbar-Klassifizierung', async () => {
    let aufrufe = 0;
    const nurEins = (fehler: unknown) => (fehler as Error).message === 'retry-mich';
    const ergebnis = await mitRetry(
      async () => {
        aufrufe += 1;
        if (aufrufe === 1) throw new Error('retry-mich');
        return 'ok';
      },
      optionen({ wiederholbar: nurEins }),
    );
    expect(ergebnis).toBe('ok');
    expect(aufrufe).toBe(2);
  });
});

describe('WIEDERHOLBARE_STATUS', () => {
  it('enthält typische transiente Statuscodes', () => {
    for (const code of [408, 425, 429, 500, 502, 503, 504]) {
      expect(WIEDERHOLBARE_STATUS.has(code)).toBe(true);
    }
  });

  it('enthält keine persistenten Client-Fehler', () => {
    for (const code of [400, 401, 403, 404, 410, 422]) {
      expect(WIEDERHOLBARE_STATUS.has(code)).toBe(false);
    }
  });
});
