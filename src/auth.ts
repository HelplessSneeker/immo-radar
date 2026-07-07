import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';

/**
 * HTTP-Basic-Auth mit genau einem Credential-Paar aus BASIC_AUTH_USER /
 * BASIC_AUTH_PASS. Fail-closed: dass die Vars gesetzt sind, erzwingt der
 * Boot-Check in server.ts – hier führt Fehlen schlicht zu 401.
 */

/** Vergleich über SHA-256-Digests: konstante Zeit ohne Längen-Sonderfall. */
function vergleicheSicher(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

function fordereAnmeldung(res: ServerResponse): void {
  res.writeHead(401, {
    'www-authenticate': 'Basic realm="immo-radar"',
    'content-type': 'text/plain; charset=utf-8',
  });
  res.end('Anmeldung erforderlich.');
}

/**
 * Prüft den Authorization-Header gegen BASIC_AUTH_USER/BASIC_AUTH_PASS.
 * Bei Fehlschlag ist die Antwort (401 + WWW-Authenticate) bereits gesendet;
 * der Aufrufer bricht dann nur noch ab.
 */
export function pruefeAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const erwarteterUser = process.env.BASIC_AUTH_USER;
  const erwartetesPass = process.env.BASIC_AUTH_PASS;
  if (!erwarteterUser || !erwartetesPass) {
    fordereAnmeldung(res);
    return false;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    fordereAnmeldung(res);
    return false;
  }

  const anmeldung = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf-8');
  const trenner = anmeldung.indexOf(':');
  if (trenner < 0) {
    fordereAnmeldung(res);
    return false;
  }

  const userStimmt = vergleicheSicher(anmeldung.slice(0, trenner), erwarteterUser);
  const passStimmt = vergleicheSicher(anmeldung.slice(trenner + 1), erwartetesPass);
  if (!userStimmt || !passStimmt) {
    fordereAnmeldung(res);
    return false;
  }
  return true;
}
