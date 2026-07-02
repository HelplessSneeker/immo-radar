import type { Inserat, InseratTyp } from './types.js';

/**
 * Minimaler CSV-Parser (RFC-4180-nah): Komma-getrennt, doppelte
 * Anführungszeichen als Quoting, "" als escaptes Quote, CRLF/LF.
 * Bewusst ohne Dependency – der Umfang rechtfertigt keine Library.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) throw new Error('CSV endet innerhalb eines Anführungszeichen-Felds.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Leere Zeilen (z. B. abschließender Zeilenumbruch) entfernen
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const REQUIRED_FIELDS = ['id', 'typ', 'ort', 'plz', 'bezirk', 'preis', 'flaeche_m2', 'zimmer', 'datum_erfasst'] as const;
const OPTIONAL_FIELDS = ['baujahr', 'zustand', 'url'] as const;

/** Validiert ein rohes Objekt (aus CSV-Zeile oder JSON-Eintrag) zu einem Inserat. */
export function toInserat(raw: Record<string, string | number | undefined>, kontext: string): Inserat {
  for (const feld of REQUIRED_FIELDS) {
    const wert = raw[feld];
    if (wert === undefined || wert === '') {
      throw new Error(`${kontext}: Pflichtfeld "${feld}" fehlt oder ist leer.`);
    }
  }

  const typ = String(raw.typ).trim().toLowerCase();
  if (typ !== 'kauf' && typ !== 'miete') {
    throw new Error(`${kontext}: typ muss "kauf" oder "miete" sein, ist "${raw.typ}".`);
  }

  const zahl = (feld: string, wert: string | number | undefined): number => {
    const n = typeof wert === 'number' ? wert : Number(String(wert).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`${kontext}: "${feld}" muss eine positive Zahl sein, ist "${wert}".`);
    }
    return n;
  };

  const baujahrRoh = raw.baujahr;
  const inserat: Inserat = {
    id: String(raw.id).trim(),
    typ: typ as InseratTyp,
    ort: String(raw.ort).trim(),
    plz: String(raw.plz).trim(),
    bezirk: String(raw.bezirk).trim(),
    preis: zahl('preis', raw.preis),
    flaeche_m2: zahl('flaeche_m2', raw.flaeche_m2),
    zimmer: zahl('zimmer', raw.zimmer),
    datum_erfasst: String(raw.datum_erfasst).trim(),
  };
  if (baujahrRoh !== undefined && baujahrRoh !== '') inserat.baujahr = zahl('baujahr', baujahrRoh);
  if (raw.zustand !== undefined && raw.zustand !== '') inserat.zustand = String(raw.zustand).trim();
  if (raw.url !== undefined && raw.url !== '') inserat.url = String(raw.url).trim();
  return inserat;
}

/** Parst eine komplette Inserate-CSV (mit Header-Zeile). */
export function parseInserateCsv(text: string, quelle = 'CSV'): Inserat[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const bekannt = new Set<string>([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  for (const feld of REQUIRED_FIELDS) {
    if (!header.includes(feld)) {
      throw new Error(`${quelle}: Header-Spalte "${feld}" fehlt. Gefunden: ${header.join(', ')}`);
    }
  }
  const unbekannt = header.filter((h) => !bekannt.has(h));
  if (unbekannt.length > 0) {
    throw new Error(`${quelle}: Unbekannte Spalte(n): ${unbekannt.join(', ')}`);
  }

  return rows.slice(1).map((row, idx) => {
    const raw: Record<string, string> = {};
    header.forEach((feld, spalte) => {
      raw[feld] = row[spalte] ?? '';
    });
    return toInserat(raw, `${quelle}, Zeile ${idx + 2}`);
  });
}

/** Parst eine JSON-Datei: Array von Inserats-Objekten. */
export function parseInserateJson(text: string, quelle = 'JSON'): Inserat[] {
  let daten: unknown;
  try {
    daten = JSON.parse(text);
  } catch (e) {
    throw new Error(`${quelle}: kein gültiges JSON (${(e as Error).message}).`);
  }
  if (!Array.isArray(daten)) {
    throw new Error(`${quelle}: erwartet ein Array von Inseraten.`);
  }
  return daten.map((eintrag, idx) =>
    toInserat(eintrag as Record<string, string | number | undefined>, `${quelle}, Eintrag ${idx + 1}`),
  );
}
