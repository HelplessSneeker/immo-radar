/**
 * Generischer Retry mit Exponential Backoff und Jitter — für Portal-Crawls,
 * bei denen einzelne transiente HTTP-5xx- oder Netzwerkfehler nicht gleich
 * das ganze Segment kosten sollen. Persistente Fehler (4xx, Layout-Bruch)
 * werden nicht wiederholt: `istWiederholbar` klassifiziert.
 *
 * Aufrufer markieren einen Fehler als transient mit `markiereWiederholbar`;
 * die Default-Klassifizierung prüft genau diese Marker-Eigenschaft, damit
 * Retry-Logik und Fehler-Klassen entkoppelt bleiben. Optional trägt der
 * Marker eine konkrete Pause-Empfehlung (z. B. aus einem Retry-After-Header),
 * die dann statt Backoff, Deckel und Jitter gilt.
 */

import { setTimeout as schlafe } from 'node:timers/promises';

const MARKER = Symbol.for('immo-radar.retry.wiederholbar');
const PAUSE = Symbol.for('immo-radar.retry.pause');

/**
 * Kennzeichnet einen Fehler als transient, sodass mitRetry ihn wiederholt.
 * `pauseMs` empfiehlt eine konkrete Wartezeit vor dem nächsten Versuch
 * (z. B. aus Retry-After) und ersetzt dann Backoff, Deckel und Jitter.
 */
export function markiereWiederholbar<E extends object>(fehler: E, pauseMs?: number): E {
  const markiert = fehler as { [MARKER]?: boolean; [PAUSE]?: number };
  markiert[MARKER] = true;
  if (pauseMs !== undefined) markiert[PAUSE] = pauseMs;
  return fehler;
}

/** Liefert true, wenn markiereWiederholbar den Fehler markiert hat. */
export function istWiederholbar(fehler: unknown): boolean {
  return (
    typeof fehler === 'object' &&
    fehler !== null &&
    (fehler as { [MARKER]?: boolean })[MARKER] === true
  );
}

/** Pause-Empfehlung aus markiereWiederholbar, falls der Fehler eine trägt. */
export function empfohlenePause(fehler: unknown): number | undefined {
  if (typeof fehler !== 'object' || fehler === null) return undefined;
  return (fehler as { [PAUSE]?: number })[PAUSE];
}

export interface RetryOptionen {
  /** Maximale Versuche insgesamt (inkl. Erstversuch). Muss ≥ 1 sein. */
  maxVersuche: number;
  /** Basis-Pause vor Versuch 2. Verdoppelt sich pro Versuch bis maxPauseMs. */
  basisPauseMs: number;
  /** Deckel für die Backoff-Pause. */
  maxPauseMs: number;
  /** Pause-Implementierung — injizierbar für Tests (no-op ⇒ instant). Default: echtes Warten. */
  warte?: (ms: number) => Promise<void>;
  /** Multiplikator ∈ [0, 1] für Jitter; default Math.random. */
  jitter?: () => number;
  /** Klassifiziert Fehler; default: markierte Fehler sind wiederholbar. */
  wiederholbar?: (fehler: unknown) => boolean;
}

/**
 * Führt fn aus und wiederholt den Aufruf bei transienten Fehlern mit
 * exponentiellem Backoff (Jitter: 50–100 % der berechneten Pause). Trägt der
 * Fehler eine Pause-Empfehlung, gilt diese statt des Backoffs.
 * Bei Erfolg liefert die erste Antwort; bei Erschöpfung wirft der zuletzt
 * gefangene Fehler.
 */
export async function mitRetry<T>(fn: () => Promise<T>, optionen: RetryOptionen): Promise<T> {
  if (!Number.isInteger(optionen.maxVersuche) || optionen.maxVersuche < 1) {
    throw new Error(`mitRetry braucht maxVersuche ≥ 1, bekommen: ${optionen.maxVersuche}.`);
  }
  const wiederholbar = optionen.wiederholbar ?? istWiederholbar;
  const jitter = optionen.jitter ?? Math.random;
  const warte = optionen.warte ?? ((ms: number) => schlafe(ms));
  let letzterFehler: unknown;
  for (let versuch = 1; versuch <= optionen.maxVersuche; versuch += 1) {
    try {
      return await fn();
    } catch (fehler) {
      letzterFehler = fehler;
      const istLetzter = versuch === optionen.maxVersuche;
      if (istLetzter || !wiederholbar(fehler)) throw fehler;
      const roh = optionen.basisPauseMs * 2 ** (versuch - 1);
      const gedeckelt = Math.min(roh, optionen.maxPauseMs);
      const pause = empfohlenePause(fehler) ?? Math.round(gedeckelt * (0.5 + 0.5 * jitter()));
      await warte(pause);
    }
  }
  throw letzterFehler;
}

/**
 * Transient behandelte HTTP-Statuscodes: Timeout und 5xx-Gateway. 429 fehlt
 * bewusst — ein Rate-Limit wiederholt ladePortalSeite nur, wenn das Portal
 * per Retry-After sagt wann (stures Nachschieben eskaliert Anti-Bot-Systeme).
 */
export const WIEDERHOLBARE_STATUS: ReadonlySet<number> = new Set([408, 425, 500, 502, 503, 504]);
