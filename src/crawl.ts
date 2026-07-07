/** Prozessweite Crawl-Serialisierung — der eine geteilte Baustein aller Portal-Zugriffe. */

let crawlKette: Promise<unknown> = Promise.resolve();

/**
 * Serialisiert Portal-Crawls prozessweit (FIFO): parallel angestoßene
 * Segmente erzeugen so nie gleichzeitigen Request-Druck auf die Portale.
 * Fehler eines Vorgängers brechen die Kette nicht.
 */
export function mitCrawlSperre<T>(fn: () => Promise<T>): Promise<T> {
  const ergebnis = crawlKette.catch(() => {}).then(fn);
  crawlKette = ergebnis.catch(() => {});
  return ergebnis;
}
