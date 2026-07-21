import { istIsoDatum } from './datum.js';
import type { InserateFilter, InserateSortierung } from './db/bestand-repo.js';
import type { InseratTyp } from './types.js';
import type { ZeitraumFilter } from './zeitraum.js';

/** Bundesland-Slug (URL-Pfad beider Portale) → Anzeigename. */
export const BUNDESLAENDER: Record<string, string> = {
  burgenland: 'Burgenland',
  kaernten: 'Kärnten',
  niederoesterreich: 'Niederösterreich',
  oberoesterreich: 'Oberösterreich',
  salzburg: 'Salzburg',
  steiermark: 'Steiermark',
  tirol: 'Tirol',
  vorarlberg: 'Vorarlberg',
  wien: 'Wien',
};

/** Ungültige Sucheingaben – der Server antwortet damit als 400. */
export class SuchKriterienFehler extends Error {}

export type SuchTyp = InseratTyp | 'beide';

export interface SuchKriterien {
  /** Bundesland-Slug, siehe BUNDESLAENDER. */
  bundesland: string;
  typ: SuchTyp;
  /** Bei typ=miete Monatsmiete, sonst Kaufpreis (in €). */
  preisMin?: number;
  preisMax?: number;
  flaecheMin?: number;
  flaecheMax?: number;
  zimmerMin?: number;
  zimmerMax?: number;
  /** Freitext, matcht Ort, PLZ oder Bezirk (Teilstring, case-insensitiv). */
  ort?: string;
  /**
   * Bezirk-Schlüssel (BEZIRKE_KAERNTEN) für die Sweep-Partitionierung —
   * schlägt in den Portal-URLs den Ort-Slug.
   */
  bezirk?: string;
}

function zahlOderUndefined(params: URLSearchParams, name: string): number | undefined {
  const roh = params.get(name)?.trim();
  if (!roh) return undefined;
  const n = Number(roh.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw new SuchKriterienFehler(`"${name}" muss eine positive Zahl sein, ist "${roh}".`);
  }
  return n;
}

export interface InserateAnfrage {
  filter: InserateFilter;
  sortierung: InserateSortierung;
  /** 1-basiert. */
  seite: number;
}

const INSERATE_SORTIERUNGEN: ReadonlySet<InserateSortierung> = new Set([
  'zuletzt_gesehen',
  'zuerst_gesehen',
  'preis',
  'eur_m2',
  'flaeche',
]);

/**
 * Query-Parameter der Bestand-Seite (/inserate). Bewusst nachsichtig – anders
 * als das werfende parseSuchKriterien: die URLs sind teilbare GET-Links,
 * ungültige Werte werden still verworfen statt mit 400 beantwortet.
 */
export function parseInserateAnfrage(params: URLSearchParams): InserateAnfrage {
  const filter: InserateFilter = {};

  const bundesland = params.get('bundesland')?.trim().toLowerCase();
  if (bundesland && bundesland in BUNDESLAENDER) filter.bundesland = bundesland;

  const typ = params.get('typ')?.trim().toLowerCase();
  if (typ === 'kauf' || typ === 'miete') filter.typ = typ;

  const status = params.get('status')?.trim().toLowerCase();
  if (status === 'aktiv' || status === 'delistet') filter.status = status;

  const ort = params.get('ort')?.trim();
  if (ort) filter.ort = ort;

  if (params.get('nur')?.trim().toLowerCase() === 'ausreisser') filter.nurAusreisser = true;

  // Baujahr-Bereich wie flaeche_min/max im Dashboard-Filter: verdrehte
  // Grenzen umdrehen; Plausibilitätsfenster wie parsePortfolioForm (1800–2100),
  // nur eben still verwerfend statt werfend.
  const jahr = (name: string): number | undefined => {
    const roh = params.get(name)?.trim();
    if (!roh) return undefined;
    const n = Number(roh);
    return Number.isInteger(n) && n >= 1800 && n <= 2100 ? n : undefined;
  };
  let baujahrMin = jahr('baujahr_min');
  let baujahrMax = jahr('baujahr_max');
  if (baujahrMin !== undefined && baujahrMax !== undefined && baujahrMin > baujahrMax) {
    [baujahrMin, baujahrMax] = [baujahrMax, baujahrMin];
  }
  if (baujahrMin !== undefined) filter.baujahrMin = baujahrMin;
  if (baujahrMax !== undefined) filter.baujahrMax = baujahrMax;

  // Detail-Facetten sind rohe Portal-Strings ("Fernwärme") — exakter Match in
  // der Query, daher nur trimmen, kein toLowerCase. Unbekannte Werte liefern
  // schlicht 0 Treffer (wie der Ort-Filter), das ist die nachsichtige Absicherung.
  const facette = (name: 'heizung' | 'zustand' | 'baustil'): void => {
    const wert = params.get(name)?.trim();
    if (wert) filter[name] = wert;
  };
  facette('heizung');
  facette('zustand');
  facette('baustil');

  const ausstattung = [
    ...new Set(
      params
        .getAll('ausstattung')
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ];
  if (ausstattung.length > 0) filter.ausstattung = ausstattung;

  const sortierungRoh = params.get('sortierung')?.trim().toLowerCase() as InserateSortierung;
  const sortierung = INSERATE_SORTIERUNGEN.has(sortierungRoh) ? sortierungRoh : 'zuletzt_gesehen';

  const seiteRoh = Math.trunc(Number(params.get('seite')));
  const seite = Number.isFinite(seiteRoh) && seiteRoh >= 1 ? seiteRoh : 1;

  return { filter, sortierung, seite };
}

/** Eingaben des Portfolio-Formulars — Persistenz-Shape siehe portfolio-repo. */
export interface PortfolioFormWerte {
  bezeichnung: string;
  plz: string;
  ort: string;
  kaufpreis: number;
  kaufdatum?: string;
  mieteMonat?: number;
  flaecheM2: number;
  zimmer: number;
  baujahr?: number;
}

/** Validiert das Portfolio-Formular; wirft SuchKriterienFehler (Server: 400 + Re-Render). */
export function parsePortfolioForm(params: URLSearchParams): PortfolioFormWerte {
  const pflichtText = (name: string, label: string): string => {
    const wert = params.get(name)?.trim();
    if (!wert) throw new SuchKriterienFehler(`${label} fehlt.`);
    return wert;
  };
  const pflichtZahl = (name: string, label: string): number => {
    const wert = zahlOderUndefined(params, name);
    if (wert === undefined) throw new SuchKriterienFehler(`${label} fehlt.`);
    return wert;
  };

  const plz = pflichtText('plz', 'Die PLZ');
  if (!/^\d{4}$/.test(plz)) {
    throw new SuchKriterienFehler(`Die PLZ muss 4-stellig sein, ist "${plz}".`);
  }

  const werte: PortfolioFormWerte = {
    bezeichnung: pflichtText('bezeichnung', 'Die Bezeichnung'),
    plz,
    ort: pflichtText('ort', 'Der Ort'),
    kaufpreis: pflichtZahl('kaufpreis', 'Der Kaufpreis'),
    flaecheM2: pflichtZahl('flaeche_m2', 'Die Wohnfläche'),
    zimmer: pflichtZahl('zimmer', 'Die Zimmeranzahl'),
  };

  const kaufdatum = params.get('kaufdatum')?.trim();
  if (kaufdatum) {
    if (!istIsoDatum(kaufdatum)) {
      throw new SuchKriterienFehler(`Das Kaufdatum muss YYYY-MM-DD sein, ist "${kaufdatum}".`);
    }
    werte.kaufdatum = kaufdatum;
  }

  const miete = zahlOderUndefined(params, 'miete_monat');
  if (miete !== undefined) werte.mieteMonat = miete;

  const baujahrRoh = params.get('baujahr')?.trim();
  if (baujahrRoh) {
    const baujahr = Number(baujahrRoh);
    if (!Number.isInteger(baujahr) || baujahr < 1800 || baujahr > 2100) {
      throw new SuchKriterienFehler(`"Baujahr" muss ein plausibles Jahr sein, ist "${baujahrRoh}".`);
    }
    werte.baujahr = baujahr;
  }

  return werte;
}

export interface DashboardFilter {
  /** PLZ-Präfix (1–4 Ziffern): "9" = Region, "9020" = exakt. */
  plz?: string;
  flaecheMin?: number;
  flaecheMax?: number;
  /** true = 1,5×IQR-Ausreißer in die Kennzahlen einrechnen; fehlt = ausgeschlossen. */
  ausreisserEinbeziehen?: boolean;
  /**
   * Drawer-lokaler Schalter der Datenpunkte-Sektion (?objekte_ausreisser=an):
   * true = Ausreißer in Serien-Median und Wolken-Median-Linie einrechnen.
   * Unabhängig vom globalen Schalter — KPIs und Zeitreihen bleiben unberührt.
   */
  objekteAusreisserEinbeziehen?: boolean;
  /** Zeitraum-Preset oder Custom-Range; fehlt = "Alle". */
  zeitraum?: ZeitraumFilter;
}

/**
 * Der kleine Dashboard-Filter (PLZ-Präfix + m²-Bereich + Zeitraum). Bewusst
 * nachsichtig wie parseInserateAnfrage: die URLs sind teilbare GET-Links,
 * ungültige Werte werden still verworfen; ein verdrehter Bereich wird
 * umgedreht. Von/Bis zählt nur paarweise und schlägt dann das Preset;
 * das Klemmen von bis auf den Sweep-Stichtag macht zeitraumZuGrenzen
 * (der Parser kennt das Sweep-Datum nicht).
 */
export function parseDashboardFilter(params: URLSearchParams): DashboardFilter {
  const filter: DashboardFilter = {};

  const plz = params.get('plz')?.trim();
  if (plz && /^\d{1,4}$/.test(plz)) filter.plz = plz;

  const zahl = (name: string): number | undefined => {
    const roh = params.get(name)?.trim();
    if (!roh) return undefined;
    const n = Number(roh.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  let min = zahl('flaeche_min');
  let max = zahl('flaeche_max');
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined) filter.flaecheMin = min;
  if (max !== undefined) filter.flaecheMax = max;

  if (params.get('ausreisser')?.trim().toLowerCase() === 'an') {
    filter.ausreisserEinbeziehen = true;
  }
  if (params.get('objekte_ausreisser')?.trim().toLowerCase() === 'an') {
    filter.objekteAusreisserEinbeziehen = true;
  }

  const datum = (name: string): string | undefined => {
    const roh = params.get(name)?.trim();
    return roh && istIsoDatum(roh) ? roh : undefined;
  };
  const von = datum('von');
  const bis = datum('bis');
  const preset = params.get('zeitraum')?.trim().toLowerCase();
  if (von !== undefined && bis !== undefined && von <= bis) {
    filter.zeitraum = { von, bis };
  } else if (preset === '7d' || preset === '30d' || preset === '90d') {
    // 'alle' wird bewusst NICHT gespeichert: es ist der Default (kein
    // Zeitraum) — sonst müsste jeder Konsument den Sonderfall behandeln.
    filter.zeitraum = { preset };
  }

  return filter;
}

/**
 * Gewünschter Datenpunkte-Stichtag (?stichtag=YYYY-MM-DD), nachsichtig wie
 * parseDashboardFilter: Unbrauchbares wird still verworfen. Ob das Datum
 * wirklich ein Trend-Stichtag ist, prüft der Handler (braucht den Trend).
 */
export function parseStichtag(params: URLSearchParams): string | undefined {
  const roh = params.get('stichtag')?.trim();
  return roh && istIsoDatum(roh) ? roh : undefined;
}

/**
 * Tabellen-Seiten der Datenpunkte-Sektion (?kauf_seite / ?miete_seite),
 * nachsichtig: alles Unbrauchbare wird Seite 1. Ob die Seite existiert,
 * klemmt der Renderer auf den gültigen Bereich.
 */
export function parseDatenpunkteSeiten(params: URLSearchParams): { kauf: number; miete: number } {
  const seite = (name: string): number => {
    const n = Number(params.get(name));
    return Number.isInteger(n) && n >= 1 ? n : 1;
  };
  return { kauf: seite('kauf_seite'), miete: seite('miete_seite') };
}

