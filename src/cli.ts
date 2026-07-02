import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { analyze } from './analyze.js';
import { FileAdapter } from './adapters/file-adapter.js';
import { ImmoScout24Adapter } from './adapters/immoscout24-adapter.js';
import { WillhabenAdapter } from './adapters/willhaben-adapter.js';
import { resolveAdapter, type SourceAdapter } from './adapters/source-adapter.js';
import { renderReport, ZIEL_RENDITE } from './report.js';
import type { Inserat } from './types.js';

const HILFE = `immo-radar – Immobilienmarkt-Analyse (V1)

Nutzung:
  immo-radar analyze --input <datei ...> [--out <report.html>]

Optionen:
  --input   Eine oder mehrere CSV-/JSON-Dateien (Shell-Globs wie daten/*.csv
            werden von der Shell expandiert).
  --out     Zieldatei für den HTML-Report (Standard: report.html).
  --help    Diese Hilfe.
`;

interface CliArgs {
  inputs: string[];
  out: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const [kommando, ...rest] = argv;
  if (kommando === '--help' || kommando === '-h' || kommando === undefined) {
    console.log(HILFE);
    process.exit(kommando === undefined ? 1 : 0);
  }
  if (kommando !== 'analyze') {
    throw new Error(`Unbekanntes Kommando "${kommando}". Verfügbar: analyze`);
  }

  const inputs: string[] = [];
  let out = 'report.html';
  let i = 0;
  while (i < rest.length) {
    const arg = rest[i]!;
    if (arg === '--input') {
      i += 1;
      while (i < rest.length && !rest[i]!.startsWith('--')) {
        inputs.push(rest[i]!);
        i += 1;
      }
      if (inputs.length === 0) throw new Error('--input braucht mindestens eine Datei.');
    } else if (arg === '--out') {
      const wert = rest[i + 1];
      if (!wert || wert.startsWith('--')) throw new Error('--out braucht einen Dateinamen.');
      out = wert;
      i += 2;
    } else if (arg === '--help' || arg === '-h') {
      console.log(HILFE);
      process.exit(0);
    } else {
      throw new Error(`Unbekannte Option "${arg}".`);
    }
  }
  if (inputs.length === 0) throw new Error('Keine Eingabedateien. Nutzung: immo-radar analyze --input daten/*.csv');
  return { inputs, out };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const adapters: SourceAdapter[] = [new FileAdapter(), new WillhabenAdapter(), new ImmoScout24Adapter()];

  const inserate: Inserat[] = [];
  for (const input of args.inputs) {
    const adapter = resolveAdapter(adapters, input);
    const geladen = await adapter.fetch(input);
    console.log(`  ${input}: ${geladen.length} Inserate (${adapter.name})`);
    inserate.push(...geladen);
  }

  const ergebnis = analyze(inserate);
  const heute = new Date().toISOString().slice(0, 10);
  const html = renderReport(ergebnis, { quellen: args.inputs, erstellt: heute });
  const ziel = resolve(args.out);
  await writeFile(ziel, html, 'utf8');

  console.log(`\nAnalyse: ${inserate.length} Inserate in ${ergebnis.gebiete.length} Gebieten`);
  for (const g of ergebnis.gebiete) {
    const rendite = g.bruttoRendite === null ? '–' : `${(g.bruttoRendite * 100).toFixed(2)} %`;
    const ziel4 = g.bruttoRendite !== null && g.bruttoRendite >= ZIEL_RENDITE ? ' ✓' : '';
    console.log(`  ${g.gebiet}: Kauf n=${g.kauf?.anzahl ?? 0}, Miete n=${g.miete?.anzahl ?? 0}, Rendite ${rendite}${ziel4}`);
  }
  console.log(`\nReport: ${ziel}`);
}

main().catch((err: unknown) => {
  console.error(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
