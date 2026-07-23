/**
 * Deterministische Fixtures für die Golden-Render-Tests.
 *
 * Die Interfaces der vier Seiten-Renderer sind auf `dev` und auf dem
 * Primitives-Branch byte-identisch — dieselbe Datei erzeugt die Goldens
 * (aus dem dev-Stand, siehe tests/golden/*.html) und füttert den Test auf
 * dem Branch. Die Fixtures decken bewusst die migrierten Flächen ab:
 * Login-Formular, Dashboard-/Inserate-/Top-Picks-Filterleiste und die
 * Blätter-Navigation (Datenpunkte-Drawer mit > 20 Kauf-Punkten, Inserate
 * mit gesamt > proSeite).
 */
import type { BestandInseratMitLand } from '../../src/db/bestand-repo.js';
import type { DashboardDaten } from '../../src/pages/dashboard-page.js';
import type { InserateSeitenDaten } from '../../src/pages/inserate-page.js';
import type { LoginSeitenDaten } from '../../src/pages/login-page.js';
import type { TopPicksDaten } from '../../src/pages/top-picks-page.js';
import type { TopPickKandidat } from '../../src/top-picks.js';
import { inseratSchluessel, type StichtagDatenpunkt } from '../../src/trend.js';

// Die Seitenleiste rendert den Benutzer-Slot aus BASIC_AUTH_USER – für
// deterministische Goldens hier fixieren (die Renderer lesen die Env zur
// Renderzeit, also nach dem Modul-Load; die Zuweisung im Modul-Scope reicht
// für Testlauf UND Regenerierung).
process.env.BASIC_AUTH_USER = 'radar';

/**
 * Der <style>-Block im <head> darf zwischen dev und Branch legitim abweichen
 * (Token-Verdrahtung, Primitives-CSS) — alles außerhalb muss byte-identisch
 * bleiben. Jede Seite hat genau einen Block (layout.ts baut ihn zentral).
 */
export function stripStyle(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/, '<style entfernt="golden-diff"></style>');
}

export const loginLeer: LoginSeitenDaten = {};

export const loginFehler: LoginSeitenDaten = {
  fehler: 'Benutzername oder Passwort falsch.',
  benutzer: 'ben & co <test>',
  returnPfad: '/portfolio',
};

function datenpunkt(overrides: Partial<StichtagDatenpunkt>): StichtagDatenpunkt {
  return {
    ort: 'Klagenfurt',
    plz: '9020',
    zimmer: 3,
    flaecheM2: 50,
    preis: 200000,
    eurM2: 4000,
    portal: 'willhaben.at',
    inseratId: 'wh-1',
    url: 'https://willhaben.at/wh-1',
    anzahlInserate: 1,
    istAusreisser: false,
    ...overrides,
  };
}

// 25 Kauf-Punkte (> DATENPUNKTE_PRO_SEITE = 20) erzwingen die Blätter-Nav,
// zwei Ausreißer üben den „N Ausreißer ausgeblendet"-Kopf des Drawers.
const kaufPunkte: StichtagDatenpunkt[] = Array.from({ length: 25 }, (_, i) =>
  datenpunkt({
    inseratId: `wh-k${i + 1}`,
    url: `https://willhaben.at/wh-k${i + 1}`,
    plz: i % 2 === 0 ? '9020' : '9061',
    zimmer: (i % 4) + 1,
    flaecheM2: 40 + i * 2,
    preis: 150000 + i * 5000,
    eurM2: Math.round((150000 + i * 5000) / (40 + i * 2)),
    istAusreisser: i >= 23,
  }),
);

const mietePunkte: StichtagDatenpunkt[] = Array.from({ length: 5 }, (_, i) =>
  datenpunkt({
    inseratId: `wh-m${i + 1}`,
    url: `https://willhaben.at/wh-m${i + 1}`,
    portal: 'immowelt.at',
    flaecheM2: 45 + i * 5,
    preis: 500 + i * 50,
    eurM2: Math.round(((500 + i * 50) / (45 + i * 5)) * 100) / 100,
  }),
);

export const dashboard: DashboardDaten = {
  stichtag: '2026-07-07',
  portalAusfaelle: ['immowelt.at'],
  trend: [
    { datum: '2026-06-23', medianKaufEurM2: 3800, medianMieteEurM2: 9.5, anzahlKauf: 38, anzahlMiete: 28 },
    { datum: '2026-06-30', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 40, anzahlMiete: 30 },
    { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
  ],
  renditeTrend: [
    { datum: '2026-06-23', bruttoRendite: 0.0305 },
    { datum: '2026-06-30', bruttoRendite: 0.0302 },
    { datum: '2026-07-07', bruttoRendite: 0.03 },
  ],
  datenpunkteTrend: [
    { datum: '2026-06-23', medianKaufEurM2: 3800, medianMieteEurM2: 9.5, anzahlKauf: 38, anzahlMiete: 28 },
    { datum: '2026-06-30', medianKaufEurM2: 3900, medianMieteEurM2: 9.8, anzahlKauf: 40, anzahlMiete: 30 },
    { datum: '2026-07-07', medianKaufEurM2: 4000, medianMieteEurM2: 10, anzahlKauf: 42, anzahlMiete: 31 },
  ],
  filter: {
    plz: '9020',
    flaecheMin: 40,
    flaecheMax: 90,
    zeitraum: { preset: '30d' },
  },
  zielRendite: 0.04,
  datenpunkte: { kauf: kaufPunkte, miete: mietePunkte },
  streuung: [
    { datum: '2026-06-23', kauf: [3600.4, 4200, 3900], miete: [9.5, 9.8] },
    { datum: '2026-06-30', kauf: [3700, 4100], miete: [9.816] },
    { datum: '2026-07-07', kauf: [4000, 4050], miete: [10] },
  ],
  datenpunkteStichtag: '2026-07-07',
  datenpunkteOffen: true,
  datenpunkteSeiten: { kauf: 2, miete: 1 },
};

function inserat(overrides: Partial<BestandInseratMitLand>): BestandInseratMitLand {
  return {
    id: 'wh-1',
    portal: 'willhaben.at',
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: 200000,
    flaeche_m2: 50,
    zimmer: 3,
    datum_erfasst: '2026-06-01',
    zuerstGesehen: '2026-06-01',
    zuletztGesehen: '2026-07-01',
    bundesland: 'kaernten',
    aktiv: true,
    ...overrides,
  };
}

const inserateAenderungen = new Map([
  [
    inseratSchluessel('willhaben.at', 'wh-1'),
    { alterPreis: 210000, neuerPreis: 200000, geaendertAm: '2026-06-20' },
  ],
]);

// seite 2 von 3 (gesamt 120 / proSeite 50) → Blätter-Nav mit Zurück UND Weiter.
export const inserate: InserateSeitenDaten = {
  inserate: [
    inserat({}),
    inserat({ id: 'iw-2', portal: 'immowelt.at', typ: 'miete', ort: 'Villach', plz: '9500', bezirk: 'Villach Stadt', preis: 780, flaeche_m2: 62, zimmer: 2 }),
    inserat({ id: 'wh-3', ort: 'Ebenthal', plz: '9065', preis: 415000, flaeche_m2: 9758, zimmer: 4, datenqualitaet: 'flaeche_ausreisser', aktiv: false }),
  ],
  gesamt: 120,
  seite: 2,
  proSeite: 50,
  filter: { typ: 'kauf', ort: 'Klagenfurt', zimmerMin: 2 },
  sortierung: 'preis',
  facetten: {
    heizung: ['Fernwärme', 'Gas'],
    zustand: ['saniert'],
    baustil: ['Altbau'],
    ausstattung: ['Balkon'],
  },
  aenderungen: inserateAenderungen,
};

function pick(overrides: Partial<TopPickKandidat>): TopPickKandidat {
  return {
    objektId: 1,
    plz: '9020',
    ort: 'Klagenfurt',
    bezirk: 'Klagenfurt Stadt',
    zimmer: 3,
    flaecheM2: 50,
    kaufpreis: 200000,
    eurM2: 4000,
    medianMieteEurM2: 10,
    bruttoRendite: 0.03,
    mieteBasis: 'plz',
    istAusreisser: false,
    portal: 'willhaben.at',
    inseratId: 'wh-1',
    url: 'https://willhaben.at/wh-1',
    ...overrides,
  };
}

export const topPicks: TopPicksDaten = {
  stichtag: '2026-07-07',
  picks: [
    pick({}),
    pick({ objektId: 2, plz: '9061', ort: 'Wölfnitz', zimmer: 2, flaecheM2: 45, kaufpreis: 140000, eurM2: 3111, medianMieteEurM2: 9.5, bruttoRendite: 0.0366, mieteBasis: 'bezirk', inseratId: 'wh-7', url: 'https://willhaben.at/wh-7' }),
    pick({ objektId: 3, plz: '9500', ort: 'Villach', bezirk: 'Villach Stadt', kaufpreis: 99000, flaecheM2: 38, eurM2: 2605, medianMieteEurM2: 10.4, bruttoRendite: 0.0479, mieteBasis: 'kaernten', istAusreisser: true, portal: 'immowelt.at', inseratId: 'iw-9', url: 'https://immowelt.at/iw-9' }),
  ],
  filterPlz: '9',
  flaecheIgnoriert: true,
  ausreisserEinbeziehen: true,
  zielRendite: 0.04,
};
