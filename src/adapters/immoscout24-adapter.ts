import { setTimeout as warte } from 'node:timers/promises';
import type { Inserat, InseratTyp } from '../types.js';
import type { SuchKriterien } from '../search.js';
import { BUNDESLAENDER } from '../search.js';
import {
  PortalFehler,
  type PortalAdapter,
  type PortalSuchErgebnis,
  type SuchOptionen,
} from './portal-adapter.js';
import { markiereWiederholbar, mitRetry, WIEDERHOLBARE_STATUS, type RetryOptionen } from '../retry.js';
import { extractInitialState, extractPageData, mapPage } from '../immoscout24/map.js';
import { buildSearchUrls } from '../immoscout24/url.js';

/** immoscout24 ist nicht erreichbar oder blockiert die Anfrage. */
export class ImmoScout24Fehler extends PortalFehler {}

// Höflich crawlen: sequentiell, mit Pause, hart gedeckelt (wie willhaben).
const MAX_SEITEN = 5;
const TREFFER_PRO_SEITE = 15;
const SEITEN_PAUSE_MS = 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

/** Default-Retry: 3 Versuche, 500 ms Basis, verdoppelt bis 4 s Cap, Jitter 50–100 %. */
const DEFAULT_RETRY: RetryOptionen = {
  maxVersuche: 3,
  basisPauseMs: 500,
  maxPauseMs: 4000,
  warte: (ms) => warte(ms),
};

export interface CrawlErgebnis {
  inserate: Inserat[];
  /** Treffer ohne verwertbare Daten (z. B. Neubauprojekte ohne Einzelpreis). */
  uebersprungen: number;
  /** Gesamttreffer laut immoscout24 – kann größer sein als das, was wir laden. */
  gesamtTreffer: number;
}

/**
 * Live-Crawl einer immoscout24-Suchseite. `source` ist eine Such-URL wie
 * https://www.immoscout24.at/regional/kaernten/wohnung-kaufen – der
 * Inserat-Typ (kauf/miete) ergibt sich aus dem Kategorie-Pfad, Seite 2 ff.
 * hängen als /seite-N am Pfad (Query-Parameter bleiben erhalten).
 */
export class ImmoScout24Adapter implements PortalAdapter {
  readonly name = 'immoscout24.at (Live-Crawl)';
  readonly portal = 'immoscout24.at';

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly seitenPauseMs: number = SEITEN_PAUSE_MS,
    private readonly retryOptionen: RetryOptionen = DEFAULT_RETRY,
  ) {}

  canHandle(source: string): boolean {
    try {
      const host = new URL(source).hostname;
      return host === 'immoscout24.at' || host.endsWith('.immoscout24.at');
    } catch {
      return false;
    }
  }

  async fetch(source: string): Promise<Inserat[]> {
    return (await this.fetchMitStatistik(source)).inserate;
  }

  async sucheMitStatistik(
    kriterien: SuchKriterien,
    optionen?: SuchOptionen,
  ): Promise<PortalSuchErgebnis[]> {
    const ergebnisse: PortalSuchErgebnis[] = [];
    for (const suche of buildSearchUrls(kriterien)) {
      const ergebnis = await this.fetchMitStatistik(suche.url, optionen?.maxSeiten);
      ergebnisse.push({ typ: suche.typ, ...ergebnis });
    }
    return ergebnisse;
  }

  async fetchMitStatistik(source: string, maxSeiten = MAX_SEITEN): Promise<CrawlErgebnis> {
    const typ = typAusUrl(source);
    const bezirk = bezirkAusUrl(source);
    const heute = new Date().toISOString().slice(0, 10);
    const basis = new URL(source);
    const basisPfad = basis.pathname.replace(/\/$/, '');
    const gesehen = new Set<string>();
    const inserate: Inserat[] = [];
    let uebersprungen = 0;
    let gesamtTreffer = 0;

    for (let seite = 1; seite <= maxSeiten; seite += 1) {
      if (seite > 1) await warte(this.seitenPauseMs);

      const url = new URL(basis);
      url.pathname = seite > 1 ? `${basisPfad}/seite-${seite}` : basisPfad;
      const html = await this.ladeSeite(url);

      const pageData = extractPageData(extractInitialState(html));
      gesamtTreffer = pageData.totalHits;
      const gemappt = mapPage(pageData, typ, bezirk, heute);
      uebersprungen += gemappt.uebersprungen;
      // Beworbene Inserate tauchen auf mehreren Seiten auf – analyze()
      // wirft bei doppelten IDs, also hier deduplizieren.
      for (const inserat of gemappt.inserate) {
        if (!gesehen.has(inserat.id)) {
          gesehen.add(inserat.id);
          inserate.push(inserat);
        }
      }

      const alleGeladen = seite * TREFFER_PRO_SEITE >= gesamtTreffer;
      if (alleGeladen || (pageData.hits?.length ?? 0) < TREFFER_PRO_SEITE) break;
    }

    return { inserate, uebersprungen, gesamtTreffer };
  }

  private ladeSeite(url: URL): Promise<string> {
    return mitRetry(async () => {
      let antwort: Response;
      try {
        antwort = await this.fetchFn(url, {
          headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (e) {
        throw markiereWiederholbar(
          new ImmoScout24Fehler(
            `immoscout24.at ist nicht erreichbar (${e instanceof Error ? e.message : String(e)}).`,
          ),
        );
      }
      if (!antwort.ok) {
        const fehler = new ImmoScout24Fehler(
          `immoscout24.at antwortet mit HTTP ${antwort.status} für ${url.pathname}.`,
        );
        if (WIEDERHOLBARE_STATUS.has(antwort.status)) markiereWiederholbar(fehler);
        throw fehler;
      }
      return antwort.text();
    }, this.retryOptionen);
  }
}

function typAusUrl(source: string): InseratTyp {
  const pfad = new URL(source).pathname;
  if (pfad.includes('/wohnung-mieten')) return 'miete';
  if (pfad.includes('/wohnung-kaufen')) return 'kauf';
  throw new ImmoScout24Fehler(
    `Aus der immoscout24-URL "${pfad}" lässt sich kein Inserat-Typ ableiten (erwartet /wohnung-kaufen oder /wohnung-mieten).`,
  );
}

/** Bundesland-Anzeigename aus /regional/{slug}/… – als Bezirk-Näherung fürs Mapping. */
function bezirkAusUrl(source: string): string {
  const slug = /\/regional\/([^/]+)\//.exec(new URL(source).pathname)?.[1];
  return (slug && BUNDESLAENDER[slug]) || '';
}
