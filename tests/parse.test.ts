import { describe, expect, it } from 'vitest';
import { parseCsv, parseInserateCsv, parseInserateJson } from '../src/parse.js';

const HEADER = 'id,typ,ort,plz,bezirk,preis,flaeche_m2,zimmer,baujahr,zustand,url,datum_erfasst';

function zeile(overrides: Partial<Record<string, string>> = {}): string {
  const basis: Record<string, string> = {
    id: 'K-1',
    typ: 'kauf',
    ort: 'Klagenfurt',
    plz: '9020',
    bezirk: 'Klagenfurt Stadt',
    preis: '165000',
    flaeche_m2: '52',
    zimmer: '2',
    baujahr: '1985',
    zustand: 'saniert',
    url: 'https://example.at/k-1',
    datum_erfasst: '2026-06-15',
  };
  Object.assign(basis, overrides);
  return HEADER.split(',')
    .map((feld) => {
      const wert = basis[feld] ?? '';
      return wert.includes(',') ? `"${wert}"` : wert;
    })
    .join(',');
}

describe('parseCsv', () => {
  it('parst einfache Zeilen', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('unterstützt Anführungszeichen mit Komma und escaptem Quote', () => {
    expect(parseCsv('"a,b","sagt ""hallo"""\n')).toEqual([['a,b', 'sagt "hallo"']]);
  });

  it('unterstützt CRLF und Zeilenumbrüche in Quotes', () => {
    expect(parseCsv('a,b\r\n"x\ny",2\r\n')).toEqual([
      ['a', 'b'],
      ['x\ny', '2'],
    ]);
  });

  it('ignoriert die leere letzte Zeile', () => {
    expect(parseCsv('a\n1\n\n')).toEqual([['a'], ['1']]);
  });

  it('wirft bei unbeendetem Quote', () => {
    expect(() => parseCsv('"abc')).toThrow(/Anführungszeichen/);
  });
});

describe('parseInserateCsv', () => {
  it('parst ein vollständiges Inserat inkl. optionaler Felder', () => {
    const [inserat] = parseInserateCsv(`${HEADER}\n${zeile()}\n`);
    expect(inserat).toEqual({
      id: 'K-1',
      typ: 'kauf',
      ort: 'Klagenfurt',
      plz: '9020',
      bezirk: 'Klagenfurt Stadt',
      preis: 165000,
      flaeche_m2: 52,
      zimmer: 2,
      baujahr: 1985,
      zustand: 'saniert',
      url: 'https://example.at/k-1',
      datum_erfasst: '2026-06-15',
    });
  });

  it('lässt optionale Felder weg, wenn leer', () => {
    const [inserat] = parseInserateCsv(`${HEADER}\n${zeile({ baujahr: '', zustand: '', url: '' })}\n`);
    expect(inserat).not.toHaveProperty('baujahr');
    expect(inserat).not.toHaveProperty('zustand');
    expect(inserat).not.toHaveProperty('url');
  });

  it('akzeptiert Dezimal-Komma bei Zahlen', () => {
    const [inserat] = parseInserateCsv(`${HEADER}\n${zeile({ flaeche_m2: '52,5' })}\n`);
    expect(inserat!.flaeche_m2).toBe(52.5);
  });

  it('wirft mit Zeilennummer bei fehlendem Pflichtfeld', () => {
    expect(() => parseInserateCsv(`${HEADER}\n${zeile({ preis: '' })}\n`)).toThrow(/Zeile 2.*"preis"/);
  });

  it('wirft bei ungültigem typ', () => {
    expect(() => parseInserateCsv(`${HEADER}\n${zeile({ typ: 'pacht' })}\n`)).toThrow(/kauf.*miete/);
  });

  it('wirft bei nicht-numerischem Preis', () => {
    expect(() => parseInserateCsv(`${HEADER}\n${zeile({ preis: 'abc' })}\n`)).toThrow(/positive Zahl/);
  });

  it('wirft bei fehlender Header-Spalte', () => {
    expect(() => parseInserateCsv('id,typ\nK-1,kauf\n')).toThrow(/Header-Spalte "ort" fehlt/);
  });

  it('wirft bei unbekannter Spalte (Tippfehler-Schutz)', () => {
    expect(() => parseInserateCsv(`${HEADER},preiss\n`)).toThrow(/Unbekannte Spalte/);
  });

  it('leere Datei ergibt leere Liste', () => {
    expect(parseInserateCsv('')).toEqual([]);
  });
});

describe('parseInserateJson', () => {
  it('parst ein Array von Inseraten', () => {
    const json = JSON.stringify([
      {
        id: 'M-1',
        typ: 'miete',
        ort: 'Villach',
        plz: '9500',
        bezirk: 'Villach Stadt',
        preis: 520,
        flaeche_m2: 52,
        zimmer: 2,
        datum_erfasst: '2026-06-20',
      },
    ]);
    const [inserat] = parseInserateJson(json);
    expect(inserat!.typ).toBe('miete');
    expect(inserat!.preis).toBe(520);
  });

  it('wirft bei Nicht-Array', () => {
    expect(() => parseInserateJson('{}')).toThrow(/Array/);
  });

  it('wirft mit Eintragsnummer bei fehlendem Feld', () => {
    expect(() => parseInserateJson('[{"id":"x"}]')).toThrow(/Eintrag 1/);
  });

  it('wirft bei kaputtem JSON', () => {
    expect(() => parseInserateJson('[')).toThrow(/gültiges JSON/);
  });
});
