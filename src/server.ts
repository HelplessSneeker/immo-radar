import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { analyze } from './analyze.js';
import { ImmoScout24Adapter } from './adapters/immoscout24-adapter.js';
import type { PortalAdapter } from './adapters/portal-adapter.js';
import { WillhabenAdapter } from './adapters/willhaben-adapter.js';
import { holePool } from './db/client.js';
import { wendeMigrationenAn } from './db/migrieren.js';
import {
  inserateLaden,
  sucheAnlegen,
  sucheLaden,
  suchenAuflisten,
  zombieSuchenBereinigen,
  type Suche,
} from './db/suchen-repo.js';
import { renderFehlerSeite, renderKeineTrefferSeite, renderSearchPage } from './pages/search-page.js';
import {
  renderFehlgeschlagenSeite,
  renderHistorieSeite,
  renderLaufendSeite,
} from './pages/suchen-pages.js';
import { renderReport } from './report.js';
import { BUNDESLAENDER, parseSuchKriterien, SuchKriterienFehler } from './search.js';
import { starteSuchlauf } from './suchlauf.js';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 16 * 1024;

const portale: PortalAdapter[] = [new WillhabenAdapter(), new ImmoScout24Adapter()];

class BodyZuGrossFehler extends Error {}

function liesBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const teile: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new BodyZuGrossFehler(`Anfrage größer als ${MAX_BODY_BYTES} Bytes.`));
        return;
      }
      teile.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(teile).toString('utf8')));
    req.on('error', reject);
  });
}

/** Rendert eine gespeicherte Suche je nach Lifecycle-Status. */
async function sucheSeite(suche: Suche): Promise<string> {
  if (suche.status === 'laufend') return renderLaufendSeite(suche);
  if (suche.status === 'fehlgeschlagen') return renderFehlgeschlagenSeite(suche);

  const inserate = await inserateLaden(suche.id);
  if (inserate.length === 0) return renderKeineTrefferSeite(suche.quellen);

  const ergebnis = analyze(inserate);
  const erstellt = (suche.beendetAm ?? suche.erstelltAm).toISOString().slice(0, 10);
  const region = BUNDESLAENDER[suche.kriterien.bundesland] ?? suche.kriterien.bundesland;
  return renderReport(ergebnis, { quellen: suche.quellen, erstellt, region });
}

function sende(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendeJson(res: ServerResponse, status: number, daten: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(daten));
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'POST') {
      if (url.pathname !== '/suchen') {
        sende(res, 404, renderFehlerSeite(404, `Unbekannter Pfad "${url.pathname}".`));
        return;
      }
      const kriterien = parseSuchKriterien(new URLSearchParams(await liesBody(req)));
      const id = await sucheAnlegen(kriterien);
      console.log(`Suche ${id} gestartet: ${JSON.stringify(kriterien)}`);
      starteSuchlauf(id, kriterien, portale);
      res.writeHead(303, { location: `/suchen/${id}` });
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sende(res, 405, renderFehlerSeite(405, 'Diese Methode wird nicht unterstützt.'));
      return;
    }

    if (url.pathname === '/') {
      sende(res, 200, renderSearchPage(await suchenAuflisten(10)));
      return;
    }
    if (url.pathname === '/suchen') {
      sende(res, 200, renderHistorieSeite(await suchenAuflisten()));
      return;
    }
    const treffer = /^\/suchen\/(\d+)(\/status)?$/.exec(url.pathname);
    if (treffer) {
      const suche = await sucheLaden(Number(treffer[1]));
      if (!suche) {
        if (treffer[2]) sendeJson(res, 404, { fehler: 'Unbekannte Suche.' });
        else sende(res, 404, renderFehlerSeite(404, `Es gibt keine Suche ${treffer[1]}.`));
        return;
      }
      if (treffer[2]) sendeJson(res, 200, { status: suche.status });
      else sende(res, 200, await sucheSeite(suche));
      return;
    }
    sende(res, 404, renderFehlerSeite(404, `Unbekannter Pfad "${url.pathname}".`));
  })().catch((err: unknown) => {
    const meldung = err instanceof Error ? err.message : String(err);
    if (err instanceof SuchKriterienFehler) {
      sende(res, 400, renderFehlerSeite(400, meldung));
    } else if (err instanceof BodyZuGrossFehler) {
      sende(res, 413, renderFehlerSeite(413, meldung));
    } else {
      console.error(err);
      sende(res, 500, renderFehlerSeite(500, 'Interner Fehler – Details stehen im Server-Log.'));
    }
  });
});

try {
  process.loadEnvFile();
} catch {
  // keine .env – DATABASE_URL kann auch direkt gesetzt sein
}

const pool = holePool();
await wendeMigrationenAn(pool);
const zombies = await zombieSuchenBereinigen();
if (zombies > 0) console.log(`${zombies} unterbrochene Suche(n) als fehlgeschlagen markiert.`);

server.listen(PORT, () => {
  console.log(`immo-radar Suche läuft: http://localhost:${PORT}`);
});
