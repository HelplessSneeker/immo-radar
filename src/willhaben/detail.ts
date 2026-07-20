import type { InseratDetail } from '../types.js';

/**
 * Mapping der willhaben-Detailseite auf die Kategorie-Felder. Die Detailseite
 * ist wie die Suche eine Next.js-Seite; die Attribute liegen als
 * name/values-Liste unter props.pageProps.advertDetails.attributes.attribute.
 * Fehlende Felder sind normal (kein Wurf) — nur der Umschlagpfad kann sich
 * verschieben, deshalb sucht ein begrenzter Fallback-Scanner die Liste anhand
 * bekannter Attributnamen, falls der direkte Pfad leer ist.
 */

interface DetailAttribut {
  name: string;
  values: string[];
}

/** Attributnamen, die eine willhaben-Attributliste sicher identifizieren. */
const SENTINEL_NAMEN = new Set(['CONSTRUCTION_YEAR', 'BUILDING_TYPE', 'HEATING', 'PROPERTY_TYPE']);
const MAX_SCAN_TIEFE = 8;

function istAttributListe(wert: unknown): wert is DetailAttribut[] {
  return (
    Array.isArray(wert) &&
    wert.length > 0 &&
    wert.every(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        typeof (e as DetailAttribut).name === 'string' &&
        Array.isArray((e as DetailAttribut).values),
    ) &&
    wert.some((e) => SENTINEL_NAMEN.has((e as DetailAttribut).name))
  );
}

/** Begrenzte rekursive Suche nach der ersten Attributliste mit Sentinel-Namen. */
function findeAttributListe(wert: unknown, tiefe = 0): DetailAttribut[] | undefined {
  if (tiefe > MAX_SCAN_TIEFE || wert === null || typeof wert !== 'object') return undefined;
  if (istAttributListe(wert)) return wert;
  const werte = Array.isArray(wert) ? wert : Object.values(wert);
  for (const kind of werte) {
    const gefunden = findeAttributListe(kind, tiefe + 1);
    if (gefunden) return gefunden;
  }
  return undefined;
}

/** "4,58" / "202" → Zahl; alles Unlesbare → undefined. */
function zahlAusText(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const zahl = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(zahl) ? zahl : undefined;
}

function baujahrAusText(text: string | undefined): number | undefined {
  const jahr = zahlAusText(text);
  if (jahr === undefined || !Number.isInteger(jahr) || jahr < 1000 || jahr > 2100) return undefined;
  return jahr;
}

/**
 * Extrahiert die Kategorie-Felder aus dem __NEXT_DATA__-JSON einer
 * willhaben-Detailseite. Liefert {} statt zu werfen, wenn keine
 * Attributliste auffindbar ist (Bot-Block/kaputtes JSON meldet schon
 * extractNextData).
 */
export function mapDetail(nextData: unknown): InseratDetail {
  const direkt = (
    nextData as {
      props?: { pageProps?: { advertDetails?: { attributes?: { attribute?: unknown } } } };
    }
  )?.props?.pageProps?.advertDetails?.attributes?.attribute;
  const liste = istAttributListe(direkt) ? direkt : findeAttributListe(nextData);
  if (!liste) return {};

  const werte = new Map<string, string[]>();
  for (const attr of liste) {
    if (!werte.has(attr.name)) werte.set(attr.name, attr.values.filter((v) => v !== ''));
  }
  const erster = (name: string): string | undefined => werte.get(name)?.[0];

  const detail: InseratDetail = {};
  const baujahr = baujahrAusText(erster('CONSTRUCTION_YEAR'));
  if (baujahr !== undefined) detail.baujahr = baujahr;
  const zustand = erster('BUILDING_CONDITION');
  if (zustand !== undefined) detail.zustand = zustand;
  const baustil = erster('BUILDING_TYPE');
  if (baustil !== undefined) detail.baustil = baustil;
  const heizung = erster('HEATING');
  if (heizung !== undefined) detail.heizung = heizung;
  // Ausstattungs-Merkmale: Vorzüge, Freiflächen-Typen und Bodenbeläge.
  const ausstattung = [
    ...(werte.get('ESTATE_PREFERENCE') ?? []),
    ...(werte.get('FREE_AREA/FREE_AREA_TYPE') ?? []),
    ...(werte.get('FLOOR_SURFACE') ?? []),
  ];
  if (ausstattung.length > 0) detail.ausstattung = ausstattung;
  const hwb = zahlAusText(erster('ENERGY_HWB'));
  if (hwb !== undefined) detail.energieHwb = hwb;
  const fgee = zahlAusText(erster('ENERGY_FGEE'));
  if (fgee !== undefined) detail.energieFgee = fgee;
  const beschreibung = erster('DESCRIPTION');
  if (beschreibung !== undefined) detail.beschreibung = beschreibung;
  return detail;
}
