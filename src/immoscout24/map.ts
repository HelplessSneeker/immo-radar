import type { Inserat, InseratTyp } from '../types.js';
import { toInserat } from '../parse.js';
import { PortalFehler } from '../adapters/portal-adapter.js';

/**
 * Extraktion und Mapping der immoscout24-Suchergebnisse.
 *
 * immoscout24 bettet den Redux-Store als `window.__INITIAL_STATE__ = {…}` in
 * ein Script-Tag ein – ein JS-Objekt-Literal, kein striktes JSON: es enthält
 * bare `undefined`-Werte, und im selben Tag folgen weitere Statements
 * (`window.E2E_MODE = false` …). Wir schneiden das Objekt per
 * Klammertiefen-Scan aus (String-bewusst, damit `{` oder "undefined" in
 * Textwerten nichts kaputt machen) und ersetzen dabei `undefined` in
 * Wert-Position durch `null`.
 */

/** immoscout24 liefert kein oder unerwartetes JSON – Layout-Änderung oder Bot-Block. */
export class ImmoScout24ParseFehler extends PortalFehler {}

const STATE_MARKER = 'window.__INITIAL_STATE__';

/** Extrahiert und parst das __INITIAL_STATE__-Objekt aus einer immoscout24-HTML-Seite. */
export function extractInitialState(html: string): unknown {
  return extractStateLiteral(html, STATE_MARKER);
}

/**
 * Schneidet das Objekt-Literal hinter `markerText` (z. B.
 * "window.__INITIAL_STATE__") per Klammertiefen-Scan aus und parst es —
 * gemeinsame Basis für Suchseiten (__INITIAL_STATE__) und Expose-Seiten
 * (__APOLLO_STATE__, siehe detail.ts).
 */
export function extractStateLiteral(html: string, markerText: string): unknown {
  const name = markerText.replace('window.', '');
  const marker = html.indexOf(markerText);
  if (marker === -1) {
    throw new ImmoScout24ParseFehler(
      `Kein ${name} in der immoscout24-Antwort gefunden – Seitenaufbau geändert oder Anfrage blockiert.`,
    );
  }
  const start = html.indexOf('{', marker + markerText.length);
  if (start === -1) throw new ImmoScout24ParseFehler(`${name} ohne Objekt-Literal.`);

  const teile: string[] = [];
  let teilStart = start;
  let json: string | null = null;
  let tiefe = 0;
  let inString = false;
  // Letztes Nicht-Whitespace-Zeichen außerhalb von Strings – `undefined` ist
  // nur direkt nach `:`, `,` oder `[` ein Wert.
  let letztesZeichen = '';

  for (let i = start; i < html.length; i += 1) {
    const ch = html[i]!;
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      tiefe += 1;
    } else if (ch === '}' || ch === ']') {
      tiefe -= 1;
      if (tiefe === 0) {
        teile.push(html.slice(teilStart, i + 1));
        json = teile.join('');
        break;
      }
    } else if (
      ch === 'u' &&
      html.startsWith('undefined', i) &&
      (letztesZeichen === ':' || letztesZeichen === ',' || letztesZeichen === '[')
    ) {
      teile.push(html.slice(teilStart, i), 'null');
      i += 'undefined'.length - 1;
      teilStart = i + 1;
      letztesZeichen = 'l';
      continue;
    }
    if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') letztesZeichen = ch;
  }

  if (json === null) throw new ImmoScout24ParseFehler(`${name}-Objekt endet nicht.`);
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new ImmoScout24ParseFehler(`${name} ist kein gültiges JSON (${(e as Error).message}).`);
  }
}

export interface ImmoScout24Hit {
  exposeId?: string | number;
  links?: { absoluteURL?: string };
  addressString?: string;
  primaryPrice?: number | null;
  primaryArea?: number | null;
  numberOfRooms?: number | null;
  dateCreated?: string;
}

export interface ImmoScout24PageData {
  totalHits: number;
  hits?: ImmoScout24Hit[];
}

/** Holt die Trefferliste (results) aus dem __INITIAL_STATE__-Objekt. */
export function extractPageData(state: unknown): ImmoScout24PageData {
  const results = (state as { reduxAsyncConnect?: { pageData?: { results?: unknown } } })
    ?.reduxAsyncConnect?.pageData?.results as ImmoScout24PageData | undefined;
  if (!results || typeof results.totalHits !== 'number') {
    throw new ImmoScout24ParseFehler('__INITIAL_STATE__ enthält keine results – Seitenaufbau geändert.');
  }
  return results;
}

/** "9201 Krumpendorf" bzw. "Seestraße 1, 9201 Krumpendorf" → [ , PLZ, Ort]. */
const ADRESSE_MUSTER = /(\d{4})\s+([^,]+?)\s*$/;

/**
 * Mappt einen immoscout24-Treffer auf unser Inserat-Schema. Liefert null für
 * Treffer ohne verwertbare Daten – v. a. Neubauprojekte, die statt
 * Einzelwerten nur Bereiche haben (primaryPrice 0, Fläche/Zimmer null).
 */
export function mapHit(hit: ImmoScout24Hit, typ: InseratTyp, bezirk: string, heute: string): Inserat | null {
  const exposeId = hit.exposeId;
  if (exposeId === undefined || exposeId === '') return null;

  const adresse = ADRESSE_MUSTER.exec(hit.addressString ?? '');
  const ort = adresse?.[2];

  const raw: Record<string, string | number | undefined> = {
    id: `is24-${exposeId}`,
    typ,
    ort,
    plz: adresse?.[1],
    // immoscout24 liefert keinen Bezirk – Bundesland als Näherung, sonst Ort.
    // Betrifft nur den Freitext-Ort-Filter; die Statistik gruppiert nach Ort.
    bezirk: bezirk || ort,
    preis: hit.primaryPrice ?? undefined,
    flaeche_m2: hit.primaryArea ?? undefined,
    zimmer: hit.numberOfRooms ?? undefined,
    url: hit.links?.absoluteURL,
    datum_erfasst: hit.dateCreated?.slice(0, 10) ?? heute,
  };

  try {
    return toInserat(raw, `immoscout24 exposeId ${exposeId}`);
  } catch {
    return null;
  }
}

export interface MapErgebnis {
  inserate: Inserat[];
  /** Treffer ohne verwertbare Daten (z. B. Neubauprojekte ohne Einzelpreis). */
  uebersprungen: number;
}

/** Mappt alle Treffer einer Ergebnisseite; unverwertbare werden gezählt statt geworfen. */
export function mapPage(pageData: ImmoScout24PageData, typ: InseratTyp, bezirk: string, heute: string): MapErgebnis {
  const inserate: Inserat[] = [];
  let uebersprungen = 0;
  for (const hit of pageData.hits ?? []) {
    const inserat = mapHit(hit, typ, bezirk, heute);
    if (inserat) inserate.push(inserat);
    else uebersprungen += 1;
  }
  return { inserate, uebersprungen };
}
