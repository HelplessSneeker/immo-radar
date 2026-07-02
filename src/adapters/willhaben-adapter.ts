import { setTimeout as warte } from 'node:timers/promises';
import type { Inserat, InseratTyp } from '../types.js';
import type { SuchKriterien } from '../search.js';
import { PortalFehler, type PortalAdapter, type PortalSuchErgebnis } from './portal-adapter.js';
import { extractNextData, extractSearchResult, mapPage } from '../willhaben/map.js';
import { buildSearchUrls } from '../willhaben/url.js';

/** willhaben ist nicht erreichbar oder blockiert die Anfrage. */
export class WillhabenFehler extends PortalFehler {}

// Höflich crawlen: sequentiell, mit Pause, hart gedeckelt.
const MAX_SEITEN = 5;
const INSERATE_PRO_SEITE = 30;
const SEITEN_PAUSE_MS = 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

export interface CrawlErgebnis {
  inserate: Inserat[];
  /** Inserate ohne verwertbare Daten (z. B. Preis auf Anfrage). */
  uebersprungen: number;
  /** Gesamttreffer laut willhaben – kann größer sein als das, was wir laden. */
  rowsFound: number;
}

/**
 * Live-Crawl einer willhaben-Suchseite. `source` ist eine Such-URL wie
 * https://www.willhaben.at/iad/immobilien/eigentumswohnung/kaernten –
 * der Inserat-Typ (kauf/miete) ergibt sich aus dem Kategorie-Pfad.
 */
export class WillhabenAdapter implements PortalAdapter {
  readonly name = 'willhaben.at (Live-Crawl)';
  readonly portal = 'willhaben.at';

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly seitenPauseMs: number = SEITEN_PAUSE_MS,
  ) {}

  canHandle(source: string): boolean {
    try {
      const host = new URL(source).hostname;
      return host === 'willhaben.at' || host.endsWith('.willhaben.at');
    } catch {
      return false;
    }
  }

  async fetch(source: string): Promise<Inserat[]> {
    return (await this.fetchMitStatistik(source)).inserate;
  }

  async sucheMitStatistik(kriterien: SuchKriterien): Promise<PortalSuchErgebnis[]> {
    const ergebnisse: PortalSuchErgebnis[] = [];
    for (const suche of buildSearchUrls(kriterien)) {
      const { inserate, uebersprungen, rowsFound } = await this.fetchMitStatistik(suche.url);
      ergebnisse.push({ typ: suche.typ, inserate, uebersprungen, gesamtTreffer: rowsFound });
    }
    return ergebnisse;
  }

  async fetchMitStatistik(source: string): Promise<CrawlErgebnis> {
    const typ = typAusUrl(source);
    const heute = new Date().toISOString().slice(0, 10);
    const gesehen = new Set<string>();
    const inserate: Inserat[] = [];
    let uebersprungen = 0;
    let rowsFound = 0;

    for (let seite = 1; seite <= MAX_SEITEN; seite += 1) {
      if (seite > 1) await warte(this.seitenPauseMs);

      const url = new URL(source);
      url.searchParams.set('rows', String(INSERATE_PRO_SEITE));
      url.searchParams.set('page', String(seite));
      const html = await this.ladeSeite(url);

      const searchResult = extractSearchResult(extractNextData(html));
      rowsFound = searchResult.rowsFound;
      const gemappt = mapPage(searchResult, typ, heute);
      uebersprungen += gemappt.uebersprungen;
      // Beworbene Inserate tauchen auf mehreren Seiten auf – analyze()
      // wirft bei doppelten IDs, also hier deduplizieren.
      for (const inserat of gemappt.inserate) {
        if (!gesehen.has(inserat.id)) {
          gesehen.add(inserat.id);
          inserate.push(inserat);
        }
      }

      const alleGeladen = seite * INSERATE_PRO_SEITE >= rowsFound;
      if (alleGeladen || searchResult.rowsReturned < INSERATE_PRO_SEITE) break;
    }

    return { inserate, uebersprungen, rowsFound };
  }

  private async ladeSeite(url: URL): Promise<string> {
    let antwort: Response;
    try {
      antwort = await this.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      throw new WillhabenFehler(
        `willhaben.at ist nicht erreichbar (${e instanceof Error ? e.message : String(e)}).`,
      );
    }
    if (!antwort.ok) {
      throw new WillhabenFehler(`willhaben.at antwortet mit HTTP ${antwort.status} für ${url.pathname}.`);
    }
    return antwort.text();
  }
}

function typAusUrl(source: string): InseratTyp {
  const pfad = new URL(source).pathname;
  if (pfad.includes('/mietwohnungen')) return 'miete';
  if (pfad.includes('/eigentumswohnung')) return 'kauf';
  throw new WillhabenFehler(
    `Aus der willhaben-URL "${pfad}" lässt sich kein Inserat-Typ ableiten (erwartet /eigentumswohnung/ oder /mietwohnungen/).`,
  );
}
