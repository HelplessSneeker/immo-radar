import type { InseratDetail } from '../types.js';
import { extractStateLiteral } from './map.js';

/**
 * Mapping der immoscout24-Expose-Seite auf die Kategorie-Felder. Anders als
 * die Suche (__INITIAL_STATE__, Redux) trägt das Expose seine Daten im
 * GraphQL-Cache `window.__APOLLO_STATE__`: flach, mit einem
 * "Expose:<id>"-Eintrag, der condition/description/characteristics hält.
 * Fehlende Felder sind normal (kein Wurf) — die characteristics sind
 * text-basierte Anzeige-Gruppen, deshalb wird defensiv über key/text
 * navigiert statt über exakte Pfade.
 */

const APOLLO_MARKER = 'window.__APOLLO_STATE__';

/** Extrahiert und parst das __APOLLO_STATE__-Objekt aus einer Expose-HTML-Seite. */
export function extractApolloState(html: string): unknown {
  return extractStateLiteral(html, APOLLO_MARKER);
}

interface CharacteristicItem {
  key?: string;
  text?: string;
}

interface Characteristic {
  key?: string;
  items?: CharacteristicItem[];
}

interface ExposeEintrag {
  description?: { descriptionNote?: string | null };
  condition?: {
    yearOfConstruction?: string | number | null;
    heatingTypes?: unknown;
    energyCertification?: {
      heatingDemand?: string | number | null;
      totalEnergyEfficiencyFactor?: string | number | null;
    } | null;
  } | null;
  fitting?: { heatingTypes?: unknown } | null;
  characteristics?: Characteristic[];
}

/** "2025" / 202 / "4,58" → Zahl; alles Unlesbare → undefined. */
function zahl(wert: string | number | null | undefined): number | undefined {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : undefined;
  if (typeof wert !== 'string') return undefined;
  const geparst = Number.parseFloat(wert.replace(',', '.'));
  return Number.isFinite(geparst) ? geparst : undefined;
}

function baujahrAus(wert: string | number | null | undefined): number | undefined {
  const jahr = zahl(wert);
  if (jahr === undefined || !Number.isInteger(jahr) || jahr < 1000 || jahr > 2100) return undefined;
  return jahr;
}

/** Erster "Expose:<id>"-Eintrag des Apollo-Caches; undefined bei fremdem JSON. */
function findeExpose(state: unknown): ExposeEintrag | undefined {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return undefined;
  for (const [key, wert] of Object.entries(state)) {
    if (key.startsWith('Expose:') && wert !== null && typeof wert === 'object') {
      return wert as ExposeEintrag;
    }
  }
  return undefined;
}

/** Item-Keys, die eigene Felder speisen und nicht in die Ausstattung gehören. */
const KEINE_AUSSTATTUNG = new Set([
  'available_from',
  'state',
  'estate_detail_type',
  'year_of_construction',
  'age',
  'condition_type',
]);

function heizungAusTypen(typen: unknown): string | undefined {
  if (!Array.isArray(typen)) return undefined;
  const texte = typen.filter((t): t is string => typeof t === 'string' && t !== '');
  return texte.length > 0 ? texte.join(', ') : undefined;
}

/**
 * Extrahiert die Kategorie-Felder aus dem __APOLLO_STATE__-Objekt einer
 * Expose-Seite. Liefert {} statt zu werfen, wenn kein Expose-Eintrag
 * auffindbar ist (Bot-Block/kaputtes JSON meldet schon extractApolloState).
 */
export function mapDetail(state: unknown): InseratDetail {
  const expose = findeExpose(state);
  if (!expose) return {};

  const items: CharacteristicItem[] = (expose.characteristics ?? []).flatMap(
    (gruppe) => gruppe.items ?? [],
  );
  const itemText = (key: string): string | undefined =>
    items.find((i) => i.key === key && typeof i.text === 'string' && i.text !== '')?.text;

  const detail: InseratDetail = {};
  // Baujahr strukturiert aus condition; Fallback: Anzeige-Text "Baujahr 2025".
  const baujahr =
    baujahrAus(expose.condition?.yearOfConstruction) ??
    baujahrAus(/(\d{4})/.exec(itemText('year_of_construction') ?? '')?.[1]);
  if (baujahr !== undefined) detail.baujahr = baujahr;
  const zustand = itemText('condition_type');
  if (zustand !== undefined) detail.zustand = zustand;
  const baustil = itemText('age');
  if (baustil !== undefined) detail.baustil = baustil;
  const heizung =
    heizungAusTypen(expose.condition?.heatingTypes) ??
    heizungAusTypen(expose.fitting?.heatingTypes) ??
    items.find((i) => i.key?.startsWith('heating') && typeof i.text === 'string' && i.text !== '')
      ?.text;
  if (heizung !== undefined) detail.heizung = heizung;
  const ausstattung = items
    .filter(
      (i) =>
        typeof i.key === 'string' &&
        !KEINE_AUSSTATTUNG.has(i.key) &&
        !i.key.startsWith('heating') &&
        typeof i.text === 'string' &&
        i.text !== '',
    )
    .map((i) => i.text as string);
  if (ausstattung.length > 0) detail.ausstattung = ausstattung;
  const hwb = zahl(expose.condition?.energyCertification?.heatingDemand);
  if (hwb !== undefined) detail.energieHwb = hwb;
  const fgee = zahl(expose.condition?.energyCertification?.totalEnergyEfficiencyFactor);
  if (fgee !== undefined) detail.energieFgee = fgee;
  const beschreibung = expose.description?.descriptionNote;
  if (typeof beschreibung === 'string' && beschreibung !== '') detail.beschreibung = beschreibung;
  return detail;
}
