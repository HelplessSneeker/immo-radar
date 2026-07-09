/**
 * Generischer Retry mit Exponential Backoff und Jitter — für Portal-Crawls,
 * bei denen einzelne transiente HTTP-5xx- oder Netzwerkfehler nicht gleich
 * das ganze Segment kosten sollen. Persistente Fehler (4xx, Layout-Bruch)
 * werden nicht wiederholt: `istWiederholbar` klassifiziert.
 *
 * Aufrufer markieren einen Fehler als transient mit `markiereWiederholbar`;
 * die Default-Klassifizierung prüft genau diese Marker-Eigenschaft, damit
 * Retry-Logik und Fehler-Klassen entkoppelt bleiben.
 */

const MARKER = Symbol.for('immo-radar.retry.wiederholbar');

/** Kennzeichnet einen Fehler als transient, sodass mitRetry ihn wiederholt. */
export function markiereWiederholbar<E extends object>(fehler: E): E {
  (fehler as { [MARKER]?: boolean })[MARKER] = true;
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

export interface RetryOptionen {
  /** Maximale Versuche insgesamt (inkl. Erstversuch). Muss ≥ 1 sein. */
  maxVersuche: number;
  /** Basis-Pause vor Versuch 2. Verdoppelt sich pro Versuch bis maxPauseMs. */
  basisPauseMs: number;
  /** Deckel für die Backoff-Pause. */
  maxPauseMs: number;
  /** Pause-Implementierung — injizierbar für Tests (no-op ⇒ instant). */
  warte: (ms: number) => Promise<void>;
  /** Multiplikator ∈ [0, 1] für Jitter; default Math.random. */
  jitter?: () => number;
  /** Klassifiziert Fehler; default: markierte Fehler sind wiederholbar. */
  wiederholbar?: (fehler: unknown) => boolean;
}

/**
 * Führt fn aus und wiederholt den Aufruf bei transienten Fehlern mit
 * exponentiellem Backoff (Jitter: 50–100 % der berechneten Pause).
 * Bei Erfolg liefert die erste Antwort; bei Erschöpfung wirft der zuletzt
 * gefangene Fehler.
 */
export async function mitRetry<T>(fn: () => Promise<T>, optionen: RetryOptionen): Promise<T> {
  const wiederholbar = optionen.wiederholbar ?? istWiederholbar;
  const jitter = optionen.jitter ?? Math.random;
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
      const pause = Math.round(gedeckelt * (0.5 + 0.5 * jitter()));
      await optionen.warte(pause);
    }
  }
  throw letzterFehler;
}

/** Transient behandelte HTTP-Statuscodes: Timeout, Rate-Limit, 5xx-Gateway. */
export const WIEDERHOLBARE_STATUS: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);
