import { createServer, type ServerResponse } from 'node:http';
import process from 'node:process';
import { analyze } from './analyze.js';
import { ImmoScout24Adapter } from './adapters/immoscout24-adapter.js';
import { PortalFehler, type PortalAdapter } from './adapters/portal-adapter.js';
import { WillhabenAdapter } from './adapters/willhaben-adapter.js';
import { renderFehlerSeite, renderKeineTrefferSeite, renderSearchPage } from './pages/search-page.js';
import { renderReport } from './report.js';
import { BUNDESLAENDER, filterInserate, parseSuchKriterien, SuchKriterienFehler } from './search.js';
import type { Inserat } from './types.js';

const PORT = Number(process.env.PORT ?? 8787);

const portale: PortalAdapter[] = [new WillhabenAdapter(), new ImmoScout24Adapter()];

async function reportHtml(params: URLSearchParams): Promise<string> {
  const kriterien = parseSuchKriterien(params);
  const region = BUNDESLAENDER[kriterien.bundesland]!;

  const inserate: Inserat[] = [];
  const gesehen = new Set<string>();
  const quellen: string[] = [];
  const fehler: PortalFehler[] = [];
  // Dasselbe Objekt kann auf mehreren Portalen inseriert sein – wir kombinieren
  // bewusst ohne portal-übergreifende Deduplizierung (kein verlässlicher Schlüssel).
  for (const portal of portale) {
    let ergebnisse;
    try {
      ergebnisse = await portal.sucheMitStatistik(kriterien);
    } catch (e) {
      // Ein ausgefallenes Portal degradiert nur zu einer Quellen-Zeile;
      // erst wenn alle scheitern, wird die Suche zum Fehler (→ 502).
      if (!(e instanceof PortalFehler)) throw e;
      fehler.push(e);
      quellen.push(`${portal.portal} ${region}: nicht abfragbar (${e.message})`);
      continue;
    }
    for (const ergebnis of ergebnisse) {
      for (const inserat of ergebnis.inserate) {
        if (!gesehen.has(inserat.id)) {
          gesehen.add(inserat.id);
          inserate.push(inserat);
        }
      }
      const uebersprungen =
        ergebnis.uebersprungen > 0 ? `, ${ergebnis.uebersprungen} ohne verwertbare Daten` : '';
      quellen.push(
        `${portal.portal} ${region} (${ergebnis.typ === 'kauf' ? 'Kauf' : 'Miete'}: ` +
          `${ergebnis.inserate.length} von ${ergebnis.gesamtTreffer} Inseraten geladen${uebersprungen})`,
      );
    }
  }
  if (fehler.length === portale.length) throw fehler[0]!;

  const treffer = filterInserate(inserate, kriterien);
  if (treffer.length === 0) return renderKeineTrefferSeite(quellen);

  const ergebnis = analyze(treffer);
  const heute = new Date().toISOString().slice(0, 10);
  return renderReport(ergebnis, { quellen, erstellt: heute, region });
}

function sende(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sende(res, 405, renderFehlerSeite(405, 'Nur GET-Anfragen werden unterstützt.'));
      return;
    }
    if (url.pathname === '/') {
      sende(res, 200, renderSearchPage());
      return;
    }
    if (url.pathname === '/report') {
      console.log(`Suche: ${url.search}`);
      sende(res, 200, await reportHtml(url.searchParams));
      return;
    }
    sende(res, 404, renderFehlerSeite(404, `Unbekannter Pfad "${url.pathname}".`));
  })().catch((err: unknown) => {
    const meldung = err instanceof Error ? err.message : String(err);
    if (err instanceof SuchKriterienFehler) {
      sende(res, 400, renderFehlerSeite(400, meldung));
    } else if (err instanceof PortalFehler) {
      sende(res, 502, renderFehlerSeite(502, `Kein Portal ist gerade abfragbar: ${meldung}`));
    } else {
      console.error(err);
      sende(res, 500, renderFehlerSeite(500, 'Interner Fehler – Details stehen im Server-Log.'));
    }
  });
});

server.listen(PORT, () => {
  console.log(`immo-radar Suche läuft: http://localhost:${PORT}`);
});
