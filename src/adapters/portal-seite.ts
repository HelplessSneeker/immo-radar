import {
  markiereWiederholbar,
  mitRetry,
  WIEDERHOLBARE_STATUS,
  type RetryOptionen,
} from '../retry.js';
import type { PortalFehler } from './portal-adapter.js';

/**
 * Gemeinsames Seiten-Laden der Portal-Adapter: fetch mit Timeout und Retry,
 * transiente Fehler (Netzwerk, Body-Abbruch, 5xx, 429 mit Retry-After)
 * markiert. Die Adapter liefern nur noch Fehlerklasse und Hostnamen —
 * Änderungen an der Retry-Politik passieren genau hier.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

/** Default-Retry der Portale: 3 Versuche, 500 ms Basis, verdoppelt bis 4 s Cap, Jitter 50–100 %. */
export const PORTAL_RETRY: RetryOptionen = {
  maxVersuche: 3,
  basisPauseMs: 500,
  maxPauseMs: 4000,
};

/** Deckel für Retry-After — länger warten wir mitten im Sweep nicht. */
const RETRY_AFTER_DECKEL_MS = 30_000;

export interface PortalSeiteKontext {
  fetchFn: typeof fetch;
  /** Hostname für Fehlermeldungen, z. B. "willhaben.at". */
  host: string;
  /** Portal-spezifische Fehlerklasse (WillhabenFehler, ImmoScout24Fehler, …). */
  fehler: new (nachricht: string) => PortalFehler;
  retry: RetryOptionen;
}

/** Lädt eine Portal-Seite als HTML-Text, mit Retry bei transienten Fehlern. */
export function ladePortalSeite(url: URL, kontext: PortalSeiteKontext): Promise<string> {
  const { fetchFn, host, fehler: Fehler, retry } = kontext;
  return mitRetry(async () => {
    let antwort: Response;
    try {
      antwort = await fetchFn(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      // Netzwerkfehler und Timeouts sind transient — Retry darf ansetzen.
      throw markiereWiederholbar(new Fehler(`${host} ist nicht erreichbar (${meldung(e)}).`));
    }
    if (!antwort.ok) {
      const httpFehler = new Fehler(
        `${host} antwortet mit HTTP ${antwort.status} für ${url.pathname}.`,
      );
      if (antwort.status === 429) {
        // Rate-Limit: nur wiederholen, wenn das Portal per Retry-After sagt
        // wann — und auch dann gedeckelt. Ohne Header fail-fast, sonst
        // eskaliert das Anti-Bot-System statt eines verlorenen Segments.
        const pauseMs = retryAfterMs(antwort.headers.get('retry-after'));
        if (pauseMs !== undefined) {
          markiereWiederholbar(httpFehler, Math.min(pauseMs, RETRY_AFTER_DECKEL_MS));
        }
      } else if (WIEDERHOLBARE_STATUS.has(antwort.status)) {
        markiereWiederholbar(httpFehler);
      }
      throw httpFehler;
    }
    try {
      return await antwort.text();
    } catch (e) {
      // Abbruch mitten im Body-Download (Reset, Timeout) ist genauso
      // transient wie ein Verbindungsfehler vor der Antwort.
      throw markiereWiederholbar(new Fehler(`${host} bricht die Antwort ab (${meldung(e)}).`));
    }
  }, retry);
}

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Retry-After: Sekunden oder HTTP-Datum → Millisekunden ab jetzt. */
function retryAfterMs(wert: string | null): number | undefined {
  if (wert === null) return undefined;
  const sekunden = Number(wert);
  if (Number.isFinite(sekunden) && sekunden >= 0) return sekunden * 1000;
  const zeitpunkt = Date.parse(wert);
  if (!Number.isNaN(zeitpunkt)) return Math.max(0, zeitpunkt - Date.now());
  return undefined;
}
