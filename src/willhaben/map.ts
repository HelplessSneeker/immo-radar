import type { Inserat, InseratTyp } from '../types.js';
import { toInserat } from '../parse.js';
import { PortalFehler } from '../adapters/portal-adapter.js';

/**
 * Extraktion und Mapping der willhaben-Suchergebnisse.
 *
 * willhaben rendert die Suche als Next.js-Seite und bettet die Treffer
 * als JSON in <script id="__NEXT_DATA__"> ein. Wir lesen genau dieses
 * JSON – kein HTML-Parsing nötig, dafür bricht der Pfad, wenn willhaben
 * das Seitengerüst ändert (dann wirft extractNextData/extractSearchResult).
 */

/** willhaben liefert kein oder unerwartetes JSON – Layout-Änderung oder Bot-Block. */
export class WillhabenParseFehler extends PortalFehler {}

export interface AdvertSummary {
  attributes?: { attribute?: { name: string; values: string[] }[] };
}

export interface WillhabenSearchResult {
  rowsFound: number;
  rowsReturned: number;
  advertSummaryList?: { advertSummary?: AdvertSummary[] };
}

const NEXT_DATA_MARKER = '<script id="__NEXT_DATA__" type="application/json">';

/** Extrahiert und parst das __NEXT_DATA__-JSON aus einer willhaben-HTML-Seite. */
export function extractNextData(html: string): unknown {
  const start = html.indexOf(NEXT_DATA_MARKER);
  if (start === -1) {
    throw new WillhabenParseFehler(
      'Kein __NEXT_DATA__ in der willhaben-Antwort gefunden – Seitenaufbau geändert oder Anfrage blockiert.',
    );
  }
  const jsonStart = start + NEXT_DATA_MARKER.length;
  const ende = html.indexOf('</script>', jsonStart);
  if (ende === -1) throw new WillhabenParseFehler('__NEXT_DATA__-Script endet nicht.');
  try {
    return JSON.parse(html.slice(jsonStart, ende));
  } catch (e) {
    throw new WillhabenParseFehler(`__NEXT_DATA__ ist kein gültiges JSON (${(e as Error).message}).`);
  }
}

/** Holt das searchResult-Objekt aus dem __NEXT_DATA__-JSON. */
export function extractSearchResult(nextData: unknown): WillhabenSearchResult {
  const searchResult = (nextData as { props?: { pageProps?: { searchResult?: unknown } } })?.props
    ?.pageProps?.searchResult as WillhabenSearchResult | undefined;
  if (!searchResult || typeof searchResult.rowsFound !== 'number') {
    throw new WillhabenParseFehler('__NEXT_DATA__ enthält kein searchResult – Seitenaufbau geändert.');
  }
  return searchResult;
}

/** Flacht die name/values-Attributliste eines Inserats zu einem Record ab (erster Wert zählt). */
function attributeRecord(ad: AdvertSummary): Record<string, string> {
  const record: Record<string, string> = {};
  for (const attr of ad.attributes?.attribute ?? []) {
    if (attr.values?.[0] !== undefined) record[attr.name] = attr.values[0];
  }
  return record;
}

/**
 * Mappt ein willhaben-Inserat auf unser Inserat-Schema. Liefert null für
 * Inserate ohne verwertbare Daten (fehlender Preis/Fläche, 0 Zimmer,
 * "Preis auf Anfrage") – die sind bei willhaben normal, kein Fehler.
 */
export function mapAdvert(ad: AdvertSummary, typ: InseratTyp, heute: string): Inserat | null {
  const attrs = attributeRecord(ad);
  const adid = attrs['ADID'];
  if (!adid) return null;

  const raw: Record<string, string | undefined> = {
    id: `wh-${adid}`,
    typ,
    ort: attrs['LOCATION'],
    plz: attrs['POSTCODE'],
    bezirk: attrs['DISTRICT'] ?? attrs['STATE'],
    preis: attrs['PRICE'],
    flaeche_m2: attrs['ESTATE_SIZE/LIVING_AREA'] ?? attrs['ESTATE_SIZE'],
    zimmer: attrs['NUMBER_OF_ROOMS'],
    url: attrs['SEO_URL'] ? `https://www.willhaben.at/iad/${attrs['SEO_URL']}` : undefined,
    datum_erfasst: attrs['PUBLISHED_String']?.slice(0, 10) ?? heute,
  };

  try {
    return toInserat(raw, `willhaben ADID ${adid}`);
  } catch {
    return null;
  }
}

export interface MapErgebnis {
  inserate: Inserat[];
  /** Inserate ohne verwertbare Daten (z. B. Preis auf Anfrage, 0 Zimmer). */
  uebersprungen: number;
}

/** Mappt alle Inserate einer Ergebnisseite; unverwertbare werden gezählt statt geworfen. */
export function mapPage(searchResult: WillhabenSearchResult, typ: InseratTyp, heute: string): MapErgebnis {
  const ads = searchResult.advertSummaryList?.advertSummary ?? [];
  const inserate: Inserat[] = [];
  let uebersprungen = 0;
  for (const ad of ads) {
    const inserat = mapAdvert(ad, typ, heute);
    if (inserat) inserate.push(inserat);
    else uebersprungen += 1;
  }
  return { inserate, uebersprungen };
}
