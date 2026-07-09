import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';

/**
 * Session-Cookie-Authentifizierung. Ein Benutzer (BASIC_AUTH_USER /
 * BASIC_AUTH_PASS) meldet sich per POST /login an; danach trägt der Browser
 * ein signiertes Cookie `sitzung` mit sich. pruefeAuth verweist ungeschützte
 * Anfragen auf /login mit dem gewünschten Ziel-Pfad als return-Parameter.
 *
 * Kein Session-Store: das Cookie enthält Benutzername und Ausgabe-Zeitpunkt,
 * HMAC-SHA256 mit SESSION_SECRET verhindert Fälschung. Sliding-Refresh
 * (siehe GLEIT_INTERVALL_MS) verlängert aktive Sitzungen.
 *
 * Boot-Check in server.ts erzwingt BASIC_AUTH_USER, BASIC_AUTH_PASS und
 * SESSION_SECRET — hier führt Fehlen defensiv zur Umleitung nach /login.
 */

/** Name des Session-Cookies. Deutsch, wie der Rest der Domäne. */
const COOKIE_NAME = 'sitzung';

/** Maximale Cookie-Lebensdauer: 30 Tage. */
const MAX_ALTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Ab diesem Alter erneuert pruefeAuth das Cookie beim nächsten Request. */
const GLEIT_INTERVALL_MS = 24 * 60 * 60 * 1000;

interface Sitzungsinhalt {
  /** Benutzername (identisch zu BASIC_AUTH_USER). */
  u: string;
  /** Ausgabezeit in Millisekunden. */
  iat: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Vergleich über SHA-256-Digests: konstante Zeit ohne Längen-Sonderfall. */
function vergleicheSicher(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function signiereSitzung(benutzer: string, geheimnis: string, jetzt = Date.now()): string {
  const inhalt: Sitzungsinhalt = { u: benutzer, iat: jetzt };
  const payload = b64url(Buffer.from(JSON.stringify(inhalt), 'utf-8'));
  const sig = b64url(createHmac('sha256', geheimnis).update(payload).digest());
  return `${payload}.${sig}`;
}

export type Sitzungspruefung =
  | { ok: true; benutzer: string; iat: number }
  | { ok: false };

export function pruefeSitzung(
  cookie: string,
  geheimnis: string,
  jetzt = Date.now(),
): Sitzungspruefung {
  const punkt = cookie.indexOf('.');
  if (punkt < 0) return { ok: false };
  const payload = cookie.slice(0, punkt);
  const sig = cookie.slice(punkt + 1);
  const erwartet = b64url(createHmac('sha256', geheimnis).update(payload).digest());
  if (sig.length !== erwartet.length) return { ok: false };
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet))) return { ok: false };
  } catch {
    return { ok: false };
  }
  let inhalt: unknown;
  try {
    inhalt = JSON.parse(fromB64url(payload).toString('utf-8'));
  } catch {
    return { ok: false };
  }
  if (
    typeof inhalt !== 'object' ||
    inhalt === null ||
    typeof (inhalt as { u?: unknown }).u !== 'string' ||
    typeof (inhalt as { iat?: unknown }).iat !== 'number'
  ) {
    return { ok: false };
  }
  const { u, iat } = inhalt as Sitzungsinhalt;
  if (!Number.isFinite(iat)) return { ok: false };
  // Uhr-Sprünge in die Vergangenheit tolerieren wir nicht: Cookies aus der
  // Zukunft sind entweder gefälscht oder das System steht falsch.
  if (jetzt < iat) return { ok: false };
  if (jetzt - iat > MAX_ALTER_MS) return { ok: false };
  return { ok: true, benutzer: u, iat };
}

function liesCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const paar of header.split(';')) {
    const idx = paar.indexOf('=');
    if (idx < 0) continue;
    const k = paar.slice(0, idx).trim();
    if (k === name) return paar.slice(idx + 1).trim();
  }
  return undefined;
}

function cookieAttribute(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_ALTER_MS / 1000)}${secure}`;
}

/** Fügt einen weiteren Set-Cookie-Header hinzu, ohne bestehende zu überschreiben. */
function haengeSetCookieAn(res: ServerResponse, wert: string): void {
  const vorhanden = res.getHeader('set-cookie');
  if (vorhanden === undefined) {
    res.setHeader('set-cookie', wert);
    return;
  }
  const liste = Array.isArray(vorhanden) ? vorhanden.map(String) : [String(vorhanden)];
  liste.push(wert);
  res.setHeader('set-cookie', liste);
}

function setzeSitzungCookie(res: ServerResponse, cookie: string): void {
  haengeSetCookieAn(res, `${COOKIE_NAME}=${cookie}${cookieAttribute()}`);
}

/**
 * Nur eigene, absolute Pfade als return zulassen — kein `//foo` (protokoll-
 * relativ) und keine kompletten URLs. Alles andere fällt auf `/`.
 */
export function sichererReturnPfad(pfad: string | undefined | null): string {
  if (typeof pfad !== 'string' || pfad === '') return '/';
  if (!pfad.startsWith('/')) return '/';
  if (pfad.startsWith('//')) return '/';
  if (pfad.startsWith('/\\')) return '/';
  return pfad;
}

function leiteZuLogin(res: ServerResponse, aktuellerPfad: string): void {
  const ziel = `/login?return=${encodeURIComponent(aktuellerPfad)}`;
  res.writeHead(303, { location: ziel });
  res.end();
}

/**
 * Session-Cookie prüfen. Fehlt oder ungültig → 303 nach /login mit dem
 * aktuellen Pfad als return-Parameter. Bei gültigem Cookie kann der Aufrufer
 * fortfahren; alte Cookies erneuern wir on-the-fly (Sliding-Refresh).
 */
export function pruefeAuth(
  req: IncomingMessage,
  res: ServerResponse,
  aktuellerPfad = '/',
): boolean {
  const geheimnis = process.env.SESSION_SECRET;
  if (!geheimnis) {
    // Fail-closed. Der Boot-Check in server.ts fängt das eigentlich ab.
    leiteZuLogin(res, aktuellerPfad);
    return false;
  }
  const cookie = liesCookie(req, COOKIE_NAME);
  if (!cookie) {
    leiteZuLogin(res, aktuellerPfad);
    return false;
  }
  const ergebnis = pruefeSitzung(cookie, geheimnis);
  if (!ergebnis.ok) {
    leiteZuLogin(res, aktuellerPfad);
    return false;
  }
  if (Date.now() - ergebnis.iat > GLEIT_INTERVALL_MS) {
    setzeSitzungCookie(res, signiereSitzung(ergebnis.benutzer, geheimnis));
  }
  return true;
}

/**
 * Nicht-umleitender Session-Check für Routen, die auch anonym antworten,
 * Angemeldeten aber mehr zeigen (z. B. /health). Kein Sliding-Refresh —
 * das bleibt pruefeAuth vorbehalten.
 */
export function hatGueltigeSitzung(req: IncomingMessage): boolean {
  const geheimnis = process.env.SESSION_SECRET;
  if (!geheimnis) return false;
  const cookie = liesCookie(req, COOKIE_NAME);
  if (!cookie) return false;
  return pruefeSitzung(cookie, geheimnis).ok;
}

/** Konstante-Zeit-Vergleich gegen BASIC_AUTH_USER/BASIC_AUTH_PASS. */
export function pruefeCredentials(benutzer: string, passwort: string): boolean {
  const erwarteterUser = process.env.BASIC_AUTH_USER;
  const erwartetesPass = process.env.BASIC_AUTH_PASS;
  if (!erwarteterUser || !erwartetesPass) return false;
  const u = vergleicheSicher(benutzer, erwarteterUser);
  const p = vergleicheSicher(passwort, erwartetesPass);
  return u && p;
}

export type LoginErgebnis =
  | { erfolg: true; ziel: string }
  | { erfolg: false; benutzer: string; returnPfad: string };

/**
 * POST /login: Formular-Body parsen, Credentials prüfen, Cookie setzen.
 * Bei Erfolg liefert die Funktion das validierte Weiterleitungsziel; der
 * Aufrufer (server.ts) sendet 303 dorthin. Bei Fehler wird der Aufrufer die
 * Login-Seite mit Fehlermeldung neu rendern.
 */
export function verarbeiteLogin(body: string, res: ServerResponse): LoginErgebnis {
  const werte = new URLSearchParams(body);
  const benutzer = werte.get('benutzer') ?? '';
  const passwort = werte.get('passwort') ?? '';
  const returnPfad = sichererReturnPfad(werte.get('return'));

  const geheimnis = process.env.SESSION_SECRET;
  if (!geheimnis || !pruefeCredentials(benutzer, passwort)) {
    return { erfolg: false, benutzer, returnPfad };
  }
  setzeSitzungCookie(res, signiereSitzung(benutzer, geheimnis));
  return { erfolg: true, ziel: returnPfad };
}
