import { describe, expect, it } from 'vitest';
import { ordneZu, type MatchInserat } from '../src/matching.js';

/** Baut ein Bestand-Inserat mit sinnvollen Kauf-Defaults (Klagenfurt, 60 m², 3 Zimmer). */
function inserat(overrides: Partial<MatchInserat> & { id: string }): MatchInserat {
  return {
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: 200000,
    flaeche_m2: 60,
    zimmer: 3,
    datum_erfasst: '2026-06-01',
    zuerstGesehen: '2026-06-01',
    zuletztGesehen: '2026-07-01',
    ...overrides,
  };
}

/** Gruppen als sortierte ID-Listen — macht Erwartungen lesbar. */
function gruppenIds(inserate: MatchInserat[]): string[][] {
  return ordneZu(inserate)
    .map((g) => g.mitglieder.map((m) => m.inserat.id).sort())
    .sort((a, b) => a[0]!.localeCompare(b[0]!));
}

describe('Regel "duplikat" (zeitlich überlappend, portal-übergreifend)', () => {
  const wh = inserat({ id: 'wh-1' });
  const is24 = inserat({ id: 'is24-1', portal: 'immoscout24.at', preis: 202000 });

  it('mergt dasselbe Objekt auf zwei Portalen', () => {
    expect(gruppenIds([wh, is24])).toEqual([['is24-1', 'wh-1']]);
    const [gruppe] = ordneZu([wh, is24]);
    expect(gruppe!.mitglieder[1]).toMatchObject({ regel: 'duplikat' });
  });

  it('mergt NIE zwei gleichzeitig aktive Inserate desselben Portals', () => {
    const zwilling = inserat({ id: 'wh-2' }); // identische Attribute, gleiches Portal
    expect(gruppenIds([wh, zwilling])).toEqual([['wh-1'], ['wh-2']]);
  });

  it('Neubauprojekt: fünf identische Einheiten eines Portals bleiben fünf Objekte', () => {
    const einheiten = ['wh-1', 'wh-2', 'wh-3', 'wh-4', 'wh-5'].map((id) => inserat({ id }));
    expect(gruppenIds(einheiten)).toHaveLength(5);
  });

  it('respektiert die Flächen-Toleranz von 1,0 m² (inklusive)', () => {
    expect(gruppenIds([wh, { ...is24, flaeche_m2: 61 }])).toEqual([['is24-1', 'wh-1']]);
    expect(gruppenIds([wh, { ...is24, flaeche_m2: 61.1 }])).toEqual([['is24-1'], ['wh-1']]);
  });

  it('verlangt exakte Zimmerzahl', () => {
    expect(gruppenIds([wh, { ...is24, zimmer: 3.5 }])).toEqual([['is24-1'], ['wh-1']]);
  });

  it('Kauf-Preistoleranz 2,5 % (inklusive)', () => {
    // 200000 vs 205128: Δ/max = 5128/205128 = 2,50 %
    expect(gruppenIds([wh, { ...is24, preis: 205128 }])).toEqual([['is24-1', 'wh-1']]);
    expect(gruppenIds([wh, { ...is24, preis: 210000 }])).toEqual([['is24-1'], ['wh-1']]);
  });

  it('Miet-Preistoleranz: 3 % oder 25 € — was großzügiger ist', () => {
    const whMiete = inserat({ id: 'wh-m', typ: 'miete', preis: 600 });
    const is24Miete = inserat({ id: 'is24-m', portal: 'immoscout24.at', typ: 'miete', preis: 625 });
    // Δ = 25 € (4 % — über 3 %, aber die €-Toleranz greift).
    expect(gruppenIds([whMiete, is24Miete])).toEqual([['is24-m', 'wh-m']]);
    expect(gruppenIds([whMiete, { ...is24Miete, preis: 630 }])).toEqual([['is24-m'], ['wh-m']]);
  });

  it('Baujahr-Guard: beide gesetzt und mehr als 2 Jahre auseinander ⇒ kein Match', () => {
    const mitBaujahr = { ...wh, baujahr: 1990 };
    expect(gruppenIds([mitBaujahr, { ...is24, baujahr: 1992 }])).toEqual([['is24-1', 'wh-1']]);
    expect(gruppenIds([mitBaujahr, { ...is24, baujahr: 1993 }])).toEqual([['is24-1'], ['wh-1']]);
    // Nur eines gesetzt ⇒ kein Guard.
    expect(gruppenIds([mitBaujahr, is24])).toEqual([['is24-1', 'wh-1']]);
  });

  it('matcht nur innerhalb von Typ und (normalisierter) PLZ', () => {
    expect(gruppenIds([wh, { ...is24, typ: 'miete', preis: 800 }])).toHaveLength(2);
    expect(gruppenIds([wh, { ...is24, plz: '9500' }])).toHaveLength(2);
    // "9020 Klagenfurt" im PLZ-Feld normalisiert auf 9020 ⇒ Match.
    expect(gruppenIds([wh, { ...is24, plz: '9020 Klagenfurt' }])).toEqual([['is24-1', 'wh-1']]);
  });
});

describe('Regel "relisting" (zeitlich disjunkt)', () => {
  const alt = inserat({ id: 'wh-alt', zuerstGesehen: '2026-03-01', zuletztGesehen: '2026-05-01' });

  it('hängt eine Wiedereinstellung (gleiches Portal, Lücke ≤ 60 Tage) ans Objekt', () => {
    const neu = inserat({
      id: 'wh-neu',
      zuerstGesehen: '2026-06-15', // 45 Tage Lücke
      zuletztGesehen: '2026-07-01',
      preis: 190000, // −5 % — innerhalb ±10 %
    });
    const gruppen = ordneZu([alt, neu]);
    expect(gruppenIds([alt, neu])).toEqual([['wh-alt', 'wh-neu']]);
    expect(gruppen[0]!.mitglieder[1]).toMatchObject({ regel: 'relisting' });
  });

  it('auch portal-übergreifend', () => {
    const neu = inserat({
      id: 'is24-neu',
      portal: 'immoscout24.at',
      zuerstGesehen: '2026-05-20',
      zuletztGesehen: '2026-07-01',
    });
    expect(gruppenIds([alt, neu])).toEqual([['is24-neu', 'wh-alt']]);
  });

  it('nicht bei mehr als 60 Tagen Lücke', () => {
    const zuSpaet = inserat({
      id: 'wh-neu',
      zuerstGesehen: '2026-07-05', // 65 Tage Lücke
      zuletztGesehen: '2026-07-07',
    });
    expect(gruppenIds([alt, zuSpaet])).toHaveLength(2);
  });

  it('Preistoleranz ±10 %', () => {
    const neu = (preis: number) =>
      inserat({ id: 'wh-neu', zuerstGesehen: '2026-06-01', zuletztGesehen: '2026-07-01', preis });
    // 180000 vs 200000: Δ/max = 10 % — gerade noch drin.
    expect(gruppenIds([alt, neu(180000)])).toEqual([['wh-alt', 'wh-neu']]);
    expect(gruppenIds([alt, neu(170000)])).toHaveLength(2);
  });

  it('die Vermarktungs-Historie bleibt eine Gruppe über mehrere Relistings', () => {
    const zweite = inserat({ id: 'wh-2', zuerstGesehen: '2026-05-10', zuletztGesehen: '2026-05-30' });
    const dritte = inserat({ id: 'wh-3', zuerstGesehen: '2026-06-10', zuletztGesehen: '2026-07-01' });
    expect(gruppenIds([alt, zweite, dritte])).toEqual([['wh-2', 'wh-3', 'wh-alt']]);
  });
});

describe('Gruppen-Invarianten und Tie-Breaks', () => {
  it('eine Gruppe hält höchstens ein zeitgleich aktives Inserat pro Portal', () => {
    // wh-a + is24-a sind Duplikate; wh-b überlappt mit wh-a ⇒ darf trotz
    // passender Attribute nicht in dieselbe Gruppe (Portal-Geschwister).
    const whA = inserat({ id: 'wh-a' });
    const is24A = inserat({ id: 'is24-a', portal: 'immoscout24.at' });
    const whB = inserat({ id: 'wh-b' });
    expect(gruppenIds([whA, is24A, whB])).toEqual([['is24-a', 'wh-a'], ['wh-b']]);
  });

  it('Tie-Break: kleinste Flächen-Differenz gewinnt, dann kleinste Preis-Differenz', () => {
    // Zwei willhaben-Einheiten (getrennte Objekte) existieren schon; das
    // später gesehene is24-Inserat passt zu beiden und wählt die genauere.
    const grob = inserat({ id: 'wh-grob', flaeche_m2: 60.9 });
    const genau = inserat({ id: 'wh-genau', flaeche_m2: 60.1 });
    const neu = inserat({
      id: 'is24-1',
      portal: 'immoscout24.at',
      flaeche_m2: 60.0,
      zuerstGesehen: '2026-06-02',
    });
    expect(gruppenIds([grob, genau, neu])).toEqual([['is24-1', 'wh-genau'], ['wh-grob']]);
  });

  it('bei gleichen Deltas gewinnt das ältere Objekt', () => {
    const aelter = inserat({ id: 'wh-alt', zuerstGesehen: '2026-05-01' });
    const juenger = inserat({ id: 'wh-jung', zuerstGesehen: '2026-06-01' });
    const neu = inserat({ id: 'is24-1', portal: 'immoscout24.at', zuerstGesehen: '2026-06-02' });
    expect(gruppenIds([aelter, juenger, neu])).toEqual([['is24-1', 'wh-alt'], ['wh-jung']]);
  });

  it('ist deterministisch: Eingabe-Reihenfolge ändert die Partition nicht', () => {
    const inserate = [
      inserat({ id: 'wh-1' }),
      inserat({ id: 'is24-1', portal: 'immoscout24.at', preis: 201000 }),
      inserat({ id: 'wh-2', flaeche_m2: 75 }),
      inserat({ id: 'is24-2', portal: 'immoscout24.at', flaeche_m2: 75.5, preis: 199000 }),
    ];
    const vorwaerts = gruppenIds(inserate);
    const rueckwaerts = gruppenIds([...inserate].reverse());
    expect(vorwaerts).toEqual(rueckwaerts);
    expect(vorwaerts).toEqual([
      ['is24-1', 'wh-1'],
      ['is24-2', 'wh-2'],
    ]);
  });

  it('ist idempotent: bestehende Zuordnungen bleiben unangetastet, Rest wird ergänzt', () => {
    const zugeordnetA = inserat({ id: 'wh-1', objektId: 7 });
    const zugeordnetB = inserat({ id: 'is24-1', portal: 'immoscout24.at', objektId: 7 });
    const offen = inserat({
      id: 'wh-neu',
      zuerstGesehen: '2026-07-05',
      zuletztGesehen: '2026-07-07',
    });
    const gruppen = ordneZu([zugeordnetA, zugeordnetB, offen]);
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0]!.objektId).toBe(7);
    expect(gruppen[0]!.mitglieder.map((m) => m.regel)).toEqual([
      'bestehend',
      'bestehend',
      'relisting',
    ]);
    // Zweiter Lauf über dieselben Daten (jetzt alles zugeordnet) ändert nichts.
    const zweiter = ordneZu([zugeordnetA, zugeordnetB, { ...offen, objektId: 7 }]);
    expect(zweiter).toHaveLength(1);
    expect(zweiter[0]!.mitglieder.every((m) => m.regel === 'bestehend')).toBe(true);
  });

  it('kanonische Attribute stammen vom ältesten Mitglied, PLZ/Ort normalisiert', () => {
    const erstes = inserat({
      id: 'wh-1',
      plz: '9020 Klagenfurt',
      ort: '9020  Klagenfurt',
      flaeche_m2: 60.5,
      zuerstGesehen: '2026-05-20',
    });
    const zweites = inserat({ id: 'is24-1', portal: 'immoscout24.at', flaeche_m2: 60 });
    const [gruppe] = ordneZu([erstes, zweites]);
    expect(gruppe!.kanon).toMatchObject({
      plz: '9020',
      ort: 'Klagenfurt',
      flaecheM2: 60.5,
      typ: 'kauf',
      zimmer: 3,
    });
  });
});
