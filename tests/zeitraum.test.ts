import { describe, expect, it } from 'vitest';
import { zeitraumZuGrenzen } from '../src/zeitraum.js';

const REFERENZ = '2026-07-14';

describe('zeitraumZuGrenzen', () => {
  it('undefined und Preset "alle" → kein Klemmen', () => {
    expect(zeitraumZuGrenzen(undefined, REFERENZ)).toBeUndefined();
    expect(zeitraumZuGrenzen({ preset: 'alle' }, REFERENZ)).toBeUndefined();
    expect(zeitraumZuGrenzen({}, REFERENZ)).toBeUndefined();
  });

  it('Presets rechnen relativ zur Referenz, Fenster inklusiv beider Enden', () => {
    // 7 Tage inkl. Referenztag: 08.–14.07. sind 7 Kalendertage.
    expect(zeitraumZuGrenzen({ preset: '7d' }, REFERENZ)).toEqual({
      von: '2026-07-08',
      bis: '2026-07-14',
    });
    expect(zeitraumZuGrenzen({ preset: '30d' }, REFERENZ)).toEqual({
      von: '2026-06-15',
      bis: '2026-07-14',
    });
    expect(zeitraumZuGrenzen({ preset: '90d' }, REFERENZ)).toEqual({
      von: '2026-04-16',
      bis: '2026-07-14',
    });
  });

  it('Custom-Grenzen überschreiben das Preset', () => {
    expect(
      zeitraumZuGrenzen({ preset: '7d', von: '2026-06-01', bis: '2026-06-30' }, REFERENZ),
    ).toEqual({ von: '2026-06-01', bis: '2026-06-30' });
  });

  it('bis in der Zukunft wird auf die Referenz geklemmt', () => {
    expect(zeitraumZuGrenzen({ von: '2026-06-01', bis: '2027-01-01' }, REFERENZ)).toEqual({
      von: '2026-06-01',
      bis: REFERENZ,
    });
  });

  it('Zeitraum komplett in der Zukunft → leeres Fenster (von > geklemmtes bis), kein stilles Verwerfen', () => {
    // Das leere Fenster liefert beim Klemmen keine Stichtage — die Seite
    // zeigt den Leer-Zustand statt still der vollen Historie.
    expect(zeitraumZuGrenzen({ von: '2026-08-01', bis: '2026-09-01' }, REFERENZ)).toEqual({
      von: '2026-08-01',
      bis: REFERENZ,
    });
  });
});
