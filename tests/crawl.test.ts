import { describe, expect, it } from 'vitest';
import { mitCrawlSperre } from '../src/crawl.js';

describe('mitCrawlSperre', () => {
  it('serialisiert überlappende Crawls FIFO', async () => {
    const ablauf: string[] = [];
    const langsam = mitCrawlSperre(async () => {
      ablauf.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      ablauf.push('a-ende');
      return 'a';
    });
    const schnell = mitCrawlSperre(async () => {
      ablauf.push('b-start');
      return 'b';
    });

    expect(await Promise.all([langsam, schnell])).toEqual(['a', 'b']);
    expect(ablauf).toEqual(['a-start', 'a-ende', 'b-start']);
  });

  it('bricht die Kette nicht, wenn ein Vorgänger scheitert', async () => {
    const kaputt = mitCrawlSperre(() => Promise.reject(new Error('kaputt')));
    const danach = mitCrawlSperre(() => Promise.resolve('läuft'));
    await expect(kaputt).rejects.toThrow('kaputt');
    expect(await danach).toBe('läuft');
  });
});
