import type { SuchKriterien } from './search.js';
import type { OrtPortal } from './ort-slugs.js';

/**
 * Die 10 politischen Bezirke Kärntens — die Partitionierung des täglichen
 * Sweeps. Slug-Konvention wie ORT_SLUGS: nur gegen die Live-Portale
 * verifizierte Slugs sind gesetzt (Datum im Kommentar), fehlende Slugs
 * lassen den Bezirk beim jeweiligen Portal aus; die Abdeckung übernimmt
 * dann das Kärnten-weite Rest-Segment mit Preisbändern
 * (siehe sweepSegmente in sweep.ts). Ein falscher Slug würde 404 auslösen
 * und das Segment für dieses Portal kosten.
 */
export interface BezirkEintrag {
  /** Stabiler Schlüssel für sweep_segmente, z. B. 'klagenfurt-stadt'. */
  schluessel: string;
  /** Anzeigename, z. B. 'Klagenfurt Stadt'. */
  name: string;
  willhaben?: string;
  immoscout24?: string;
}

export const KAERNTEN = 'kaernten';

/** Schlüssel des Kärnten-weiten Rest-Segments (kein echter Bezirk). */
export const BEZIRK_GESAMT = 'gesamt';

// Alle Slugs am 2026-07-07 per scripts/verifiziere-bezirke.ts gegen beide
// Live-Portale verifiziert (HTTP 200, plausible Trefferzahlen, DISTRICT-Feld
// der Treffer passt). Besonderheiten: willhaben trennt 'klagenfurt' (Stadt)
// von 'klagenfurt-land'; immoscout24 nennt die Stadt 'klagenfurt-am-woerthersee'.
export const BEZIRKE_KAERNTEN: BezirkEintrag[] = [
  {
    schluessel: 'klagenfurt-stadt',
    name: 'Klagenfurt Stadt',
    willhaben: 'klagenfurt',
    immoscout24: 'klagenfurt-am-woerthersee',
  },
  { schluessel: 'villach-stadt', name: 'Villach Stadt', willhaben: 'villach', immoscout24: 'villach' },
  {
    schluessel: 'klagenfurt-land',
    name: 'Klagenfurt Land',
    willhaben: 'klagenfurt-land',
    immoscout24: 'klagenfurt-land',
  },
  { schluessel: 'villach-land', name: 'Villach Land', willhaben: 'villach-land', immoscout24: 'villach-land' },
  { schluessel: 'feldkirchen', name: 'Feldkirchen', willhaben: 'feldkirchen', immoscout24: 'feldkirchen' },
  { schluessel: 'hermagor', name: 'Hermagor', willhaben: 'hermagor', immoscout24: 'hermagor' },
  {
    schluessel: 'sankt-veit-an-der-glan',
    name: 'Sankt Veit an der Glan',
    willhaben: 'sankt-veit-an-der-glan',
    immoscout24: 'sankt-veit-an-der-glan',
  },
  {
    schluessel: 'spittal-an-der-drau',
    name: 'Spittal an der Drau',
    willhaben: 'spittal-an-der-drau',
    immoscout24: 'spittal-an-der-drau',
  },
  { schluessel: 'voelkermarkt', name: 'Völkermarkt', willhaben: 'voelkermarkt', immoscout24: 'voelkermarkt' },
  { schluessel: 'wolfsberg', name: 'Wolfsberg', willhaben: 'wolfsberg', immoscout24: 'wolfsberg' },
];

const NACH_SCHLUESSEL = new Map(BEZIRKE_KAERNTEN.map((b) => [b.schluessel, b]));

export function bezirkEintrag(schluessel: string): BezirkEintrag | undefined {
  return NACH_SCHLUESSEL.get(schluessel);
}

/** Anzeigename zum Segment-Schlüssel — auch für das Rest-Segment. */
export function bezirkName(schluessel: string): string {
  if (schluessel === BEZIRK_GESAMT) return 'Kärnten gesamt';
  return NACH_SCHLUESSEL.get(schluessel)?.name ?? schluessel;
}

/**
 * Pfad-Slug zum Kriterien-Bezirk fürs Portal — undefined bei unbekanntem
 * Bezirk, fehlendem Portal-Slug oder außerhalb Kärntens (dann bleibt es bei
 * der Bundesland-weiten URL).
 */
export function bezirkSlug(kriterien: SuchKriterien, portal: OrtPortal): string | undefined {
  if (!kriterien.bezirk || kriterien.bundesland !== KAERNTEN) return undefined;
  return NACH_SCHLUESSEL.get(kriterien.bezirk)?.[portal];
}
