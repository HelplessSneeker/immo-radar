import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Inserat } from '../types.js';
import type { SourceAdapter } from './source-adapter.js';
import { parseInserateCsv, parseInserateJson } from '../parse.js';

/**
 * V1-Adapter: liest manuell exportierte bzw. abgetippte Inserate
 * aus lokalen CSV- oder JSON-Dateien.
 */
export class FileAdapter implements SourceAdapter {
  readonly name = 'Datei-Import (CSV/JSON)';

  canHandle(source: string): boolean {
    const ext = extname(source).toLowerCase();
    return ext === '.csv' || ext === '.json';
  }

  async fetch(source: string): Promise<Inserat[]> {
    const text = await readFile(source, 'utf8');
    return extname(source).toLowerCase() === '.json'
      ? parseInserateJson(text, source)
      : parseInserateCsv(text, source);
  }
}
