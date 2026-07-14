import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { ImmoScout24Adapter } from './adapters/immoscout24-adapter.js';
import type { PortalAdapter } from './adapters/portal-adapter.js';
import { WillhabenAdapter } from './adapters/willhaben-adapter.js';
import { hatGueltigeSitzung, pruefeAuth, verarbeiteLogin } from './auth.js';
import { KAERNTEN } from './bezirke.js';
import {
  bestandSeiteLaden,
  inseratAnzahlProTyp,
  preisHistorieFuerInserate,
} from './db/bestand-repo.js';
import { holePool, schliessePool } from './db/client.js';
import { wendeMigrationenAn } from './db/migrieren.js';
import { objektBestandLaden } from './db/objekte-repo.js';
import {
  portfolioAktualisieren,
  portfolioAnlegen,
  portfolioAuflisten,
  portfolioLaden,
  portfolioLoeschen,
} from './db/portfolio-repo.js';
import {
  fertigeSweepTage,
  laufenderSweep,
  letzterFertigerSweep,
  segmenteFuerDatum,
  sweepLaeufeAuflisten,
  zombieSweepsBereinigen,
} from './db/sweep-repo.js';
import { behandleHealth, paketVersion } from './health.js';
import { renderDashboardOhneDatenSeite, renderDashboardSeite } from './pages/dashboard-page.js';
import { renderFehlerSeite } from './pages/fehler-page.js';
import { renderInserateSeite } from './pages/inserate-page.js';
import { renderLoginSeite } from './pages/login-page.js';
import { renderMethodikSeite } from './pages/methodik-page.js';
import {
  renderPortfolioBearbeitenSeite,
  renderPortfolioSeite,
  type PortfolioFormFehler,
} from './pages/portfolio-pages.js';
import { renderSweepSeite } from './pages/sweep-page.js';
import { renderTopPicksOhneDatenSeite, renderTopPicksSeite } from './pages/top-picks-page.js';
import { vergleichePortfolio } from './portfolio-vergleich.js';
import { ZIEL_RENDITE } from './report.js';
import { starteZeitplan } from './scheduler.js';
import { topPicks } from './top-picks.js';
import {
  parseDashboardFilter,
  parseDatenpunkteSeiten,
  parseInserateAnfrage,
  parsePortfolioForm,
  parseStichtag,
  SuchKriterienFehler,
} from './search.js';
import {
  berechneObjektTrend,
  berechneRenditeTrend,
  datenpunkteAmStichtag,
  filterObjekte,
  letztePreisAenderungen,
  objekteAusBestand,
  stichtageFuerTrend,
  streuungJeStichtag,
} from './trend.js';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 16 * 1024;
const VERSION = paketVersion();

/** Zeilen pro Seite der Bestand-Tabelle (/inserate). */
const INSERATE_PRO_SEITE = 50;

/** Sweep-Läufe auf der Crawl-Seite. */
const MAX_SWEEP_LAEUFE = 30;

const portale: PortalAdapter[] = [new WillhabenAdapter(), new ImmoScout24Adapter()];

/**
 * Single-Flight um letzterFertigerSweep für /health: hängt die Abfrage
 * (z. B. bei einem Lock auf sweep_laeufe), teilen sich alle parallel
 * eintrudelnden Healthchecks einen Aufruf, statt je einen Pool-Client zu
 * belegen, bis der Pool leer ist.
 */
let sweepAbfrage: ReturnType<typeof letzterFertigerSweep> | undefined;
function letzterSweepFuerHealth(): ReturnType<typeof letzterFertigerSweep> {
  sweepAbfrage ??= letzterFertigerSweep().finally(() => {
    sweepAbfrage = undefined;
  });
  return sweepAbfrage;
}

class BodyZuGrossFehler extends Error {}

function liesBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const teile: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new BodyZuGrossFehler('Der Request-Body ist zu groß.'));
        return;
      }
      teile.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(teile).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Die Startseite: Markt-Dashboard über die deduplizierten Kärnten-Objekte. */
async function dashboardSeite(params: URLSearchParams): Promise<string> {
  const filter = parseDashboardFilter(params);
  const [sweep, laufend] = await Promise.all([letzterFertigerSweep(), laufenderSweep()]);
  if (!sweep) return renderDashboardOhneDatenSeite(laufend !== undefined);

  const [{ bestand, historie }, segmente, sweepTage, inserateImLauf] = await Promise.all([
    objektBestandLaden(KAERNTEN),
    segmenteFuerDatum(sweep.laufDatum),
    fertigeSweepTage(),
    inseratAnzahlProTyp(KAERNTEN, sweep.laufDatum),
  ]);
  const alleObjekte = objekteAusBestand(bestand, historie);
  // Stichtage aus dem UNGEFILTERTEN Bestand ableiten, damit das Raster nicht
  // mit dem PLZ/m²-Filter variiert; Deckel auf den Seiten-Stichtag, falls
  // zwischen den Queries gerade ein Sweep fertig geworden ist.
  const stichtage = stichtageFuerTrend(alleObjekte, sweepTage).filter(
    (d) => d <= sweep.laufDatum,
  );
  const objekte = filterObjekte(alleObjekte, filter);
  const trend = berechneObjektTrend(objekte, stichtage, filter.ausreisserEinbeziehen === true);
  // Datenpunkte-Sektion: gewünschter Stichtag muss im Trend liegen, sonst
  // still der letzte (alte Links, Filterwechsel verschiebt den Trend-Start).
  const gewuenscht = parseStichtag(params);
  const datenpunkteStichtag =
    gewuenscht !== undefined && trend.some((t) => t.datum === gewuenscht)
      ? gewuenscht
      : trend.at(-1)?.datum;
  const datenpunkte =
    datenpunkteStichtag !== undefined
      ? datenpunkteAmStichtag(objekte, datenpunkteStichtag)
      : { kauf: [], miete: [] };
  return renderDashboardSeite({
    stichtag: sweep.laufDatum,
    sweepBeendetAm: sweep.beendetAm,
    portalAusfaelle: segmente
      .filter((s) => s.status === 'fehlgeschlagen')
      .map((s) => s.quelle ?? `${s.portal} ${s.bezirk}`),
    sweepLaeuft: laufend !== undefined,
    inserateImLauf,
    trend,
    renditeTrend: berechneRenditeTrend(trend),
    filter,
    zielRendite: ZIEL_RENDITE,
    datenpunkte,
    streuung: streuungJeStichtag(objekte, trend.map((t) => t.datum)),
    datenpunkteStichtag,
    datenpunkteOffen: params.has('stichtag'),
    datenpunkteSeiten: parseDatenpunkteSeiten(params),
  });
}

/** Top Picks: die aktiven Kauf-Objekte mit der höchsten geschätzten Bruttorendite. */
async function topPicksSeite(params: URLSearchParams): Promise<string> {
  const filter = parseDashboardFilter(params); // nur filter.plz wird genutzt
  const [sweep, laufend] = await Promise.all([letzterFertigerSweep(), laufenderSweep()]);
  if (!sweep) return renderTopPicksOhneDatenSeite(laufend !== undefined);

  const { bestand, historie } = await objektBestandLaden(KAERNTEN);
  // UNGEFILTERT an topPicks: der PLZ-Filter grenzt dort nur die Kauf-Kandidaten
  // ein, die Miet-Mediane der Gebiets-Kaskade brauchen alle Miet-Objekte.
  const objekte = objekteAusBestand(bestand, historie);
  const daten = {
    stichtag: sweep.laufDatum,
    picks: topPicks(objekte, sweep.laufDatum, filter.plz),
    zielRendite: ZIEL_RENDITE,
  };
  return renderTopPicksSeite(filter.plz !== undefined ? { ...daten, filterPlz: filter.plz } : daten);
}

/** Portfolio-Liste mit Marktvergleich — geteilt von GET /portfolio und dem POST-Fehlerpfad. */
async function portfolioSeite(fehler?: PortfolioFormFehler): Promise<string> {
  const [objekte, sweep] = await Promise.all([portfolioAuflisten(), letzterFertigerSweep()]);
  let zeilen;
  if (sweep && objekte.length > 0) {
    const { bestand, historie } = await objektBestandLaden(KAERNTEN);
    const marktObjekte = objekteAusBestand(bestand, historie);
    zeilen = objekte.map((objekt) => ({
      objekt,
      vergleich: vergleichePortfolio(objekt, marktObjekte, sweep.laufDatum),
    }));
  } else {
    zeilen = objekte.map((objekt) => ({ objekt, vergleich: {} }));
  }
  const daten: Parameters<typeof renderPortfolioSeite>[0] = {
    zeilen,
    zielRendite: ZIEL_RENDITE,
  };
  if (sweep) daten.stichtag = sweep.laufDatum;
  if (fehler) daten.fehler = fehler;
  return renderPortfolioSeite(daten);
}

/** Beobachtbarkeit des Sweeps: alle Läufe + Segmente des jüngsten Tages. */
async function sweepSeite(): Promise<string> {
  const laeufe = await sweepLaeufeAuflisten(MAX_SWEEP_LAEUFE);
  const juengster = laeufe[0];
  const segmente = juengster ? await segmenteFuerDatum(juengster.laufDatum) : [];
  const daten: Parameters<typeof renderSweepSeite>[0] = { laeufe, segmente };
  if (juengster) daten.segmentDatum = juengster.laufDatum;
  return renderSweepSeite(daten);
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

    // Healthcheck (Coolify) ist die einzige Route ohne Anmeldung.
    if (url.pathname === '/health') {
      await behandleHealth(
        {
          pool,
          version: VERSION,
          angemeldet: hatGueltigeSitzung(req),
          letzterSweep: letzterSweepFuerHealth,
        },
        res,
      );
      return;
    }
    // Anmeldung ist vor pruefeAuth zugänglich, sonst wäre der Login-Weg
    // selbst gesperrt. GET zeigt das Formular, POST verarbeitet es.
    if (url.pathname === '/login' && req.method === 'GET') {
      sende(res, 200, renderLoginSeite({ returnPfad: url.searchParams.get('return') ?? undefined }));
      return;
    }
    if (url.pathname === '/login' && req.method === 'POST') {
      let body: string;
      try {
        body = await liesBody(req);
      } catch (err) {
        if (err instanceof BodyZuGrossFehler) {
          sende(res, 413, renderFehlerSeite(413, err.message));
          return;
        }
        throw err;
      }
      const ergebnis = verarbeiteLogin(body, res);
      if (ergebnis.erfolg) {
        res.writeHead(303, { location: ergebnis.ziel });
        res.end();
        return;
      }
      sende(
        res,
        400,
        renderLoginSeite({
          fehler: 'Benutzer oder Passwort falsch.',
          benutzer: ergebnis.benutzer,
          returnPfad: ergebnis.returnPfad,
        }),
      );
      return;
    }
    if (!pruefeAuth(req, res, url.pathname + url.search)) return;

    if (req.method === 'POST') {
      if (url.pathname === '/portfolio') {
        const werte = new URLSearchParams(await liesBody(req));
        try {
          const eingabe = parsePortfolioForm(werte);
          const id = await portfolioAnlegen(eingabe);
          console.log(`Portfolio-Objekt ${id} angelegt: "${eingabe.bezeichnung}".`);
        } catch (err) {
          if (err instanceof SuchKriterienFehler) {
            sende(res, 400, await portfolioSeite({ werte, meldung: err.message }));
            return;
          }
          throw err;
        }
        res.writeHead(303, { location: '/portfolio' });
        res.end();
        return;
      }
      const portfolioAktion = /^\/portfolio\/(\d+)\/(bearbeiten|loeschen)$/.exec(url.pathname);
      if (portfolioAktion) {
        const id = Number(portfolioAktion[1]);
        const objekt = await portfolioLaden(id);
        if (!objekt) {
          sende(res, 404, renderFehlerSeite(404, `Es gibt kein Portfolio-Objekt ${portfolioAktion[1]}.`));
          return;
        }
        if (portfolioAktion[2] === 'loeschen') {
          await portfolioLoeschen(id);
          console.log(`Portfolio-Objekt ${id} ("${objekt.bezeichnung}") gelöscht.`);
        } else {
          const werte = new URLSearchParams(await liesBody(req));
          try {
            await portfolioAktualisieren(id, parsePortfolioForm(werte));
          } catch (err) {
            if (err instanceof SuchKriterienFehler) {
              sende(res, 400, renderPortfolioBearbeitenSeite(objekt, { werte, meldung: err.message }));
              return;
            }
            throw err;
          }
        }
        res.writeHead(303, { location: '/portfolio' });
        res.end();
        return;
      }
      sende(res, 404, renderFehlerSeite(404, `Unbekannter Pfad "${url.pathname}".`));
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sende(res, 405, renderFehlerSeite(405, 'Diese Methode wird nicht unterstützt.'));
      return;
    }

    if (url.pathname === '/api/laufend') {
      // Kompakte Antwort für den Aktivitäts-Indikator im Kopf: läuft der
      // Sweep gerade? Client pollt alle paar Sekunden.
      const sweep = await laufenderSweep();
      sendeJson(res, 200, { sweep: sweep ? { laufDatum: sweep.laufDatum } : null });
      return;
    }

    if (url.pathname === '/') {
      sende(res, 200, await dashboardSeite(url.searchParams));
      return;
    }
    if (url.pathname === '/top-picks') {
      sende(res, 200, await topPicksSeite(url.searchParams));
      return;
    }
    if (url.pathname === '/crawl') {
      sende(res, 200, await sweepSeite());
      return;
    }
    if (url.pathname === '/portfolio') {
      sende(res, 200, await portfolioSeite());
      return;
    }
    {
      const treffer = /^\/portfolio\/(\d+)\/bearbeiten$/.exec(url.pathname);
      if (treffer) {
        const objekt = await portfolioLaden(Number(treffer[1]));
        if (!objekt) {
          sende(res, 404, renderFehlerSeite(404, `Es gibt kein Portfolio-Objekt ${treffer[1]}.`));
          return;
        }
        sende(res, 200, renderPortfolioBearbeitenSeite(objekt));
        return;
      }
    }
    if (url.pathname === '/inserate') {
      const anfrage = parseInserateAnfrage(url.searchParams);
      const { inserate, gesamt } = await bestandSeiteLaden(
        anfrage.filter,
        anfrage.sortierung,
        INSERATE_PRO_SEITE,
        (anfrage.seite - 1) * INSERATE_PRO_SEITE,
      );
      const aenderungen = letztePreisAenderungen(await preisHistorieFuerInserate(inserate));
      sende(
        res,
        200,
        renderInserateSeite({
          inserate,
          gesamt,
          seite: anfrage.seite,
          proSeite: INSERATE_PRO_SEITE,
          filter: anfrage.filter,
          sortierung: anfrage.sortierung,
          aenderungen,
        }),
      );
      return;
    }
    if (url.pathname === '/methodik') {
      // Konstanten reinreichen, damit der Erklärtext wahr bleibt, wenn sie sich ändern.
      sende(res, 200, renderMethodikSeite({ zielRendite: ZIEL_RENDITE }));
      return;
    }
    if (
      url.pathname === '/suche' ||
      url.pathname === '/suchen' ||
      url.pathname === '/gebiete' ||
      /^\/(suchen|gebiete)\//.test(url.pathname)
    ) {
      // Alte Lesezeichen der Such-/Gebiete-Welt: das Dashboard ersetzt beides.
      res.writeHead(301, { location: '/' });
      res.end();
      return;
    }
    sende(res, 404, renderFehlerSeite(404, `Unbekannter Pfad "${url.pathname}".`));
  })().catch((err: unknown) => {
    const meldung = err instanceof SuchKriterienFehler ? err.message : undefined;
    if (meldung !== undefined) {
      sende(res, 400, renderFehlerSeite(400, meldung));
    } else if (err instanceof BodyZuGrossFehler) {
      sende(res, 413, renderFehlerSeite(413, err.message));
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

// Fail-closed: ohne Credentials und Session-Secret startet der Server nicht.
if (!process.env.BASIC_AUTH_USER || !process.env.BASIC_AUTH_PASS) {
  console.error(
    'BASIC_AUTH_USER und BASIC_AUTH_PASS müssen gesetzt sein (siehe .env.example) – ' +
      'ohne Zugangsschutz startet der Server nicht.',
  );
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error(
    'SESSION_SECRET muss gesetzt sein und mindestens 32 Zeichen haben (siehe .env.example) – ' +
      'ohne Session-Secret kann kein Anmelde-Cookie signiert werden.',
  );
  process.exit(1);
}

const pool = holePool();
await wendeMigrationenAn(pool);
const zombieSweeps = await zombieSweepsBereinigen();
if (zombieSweeps > 0) {
  console.log(`${zombieSweeps} unterbrochene(r) Sweep(s) als fehlgeschlagen markiert.`);
}
const zeitplan = starteZeitplan(portale);

server.listen(PORT, () => {
  console.log(`immo-radar läuft: http://localhost:${PORT}`);
});

function fahreHerunter(signal: string): void {
  console.log(`${signal} empfangen – Server wird beendet.`);
  zeitplan.stop();
  // Falls Verbindungen hängen: nach 10 s trotzdem beenden.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void schliessePool().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => fahreHerunter('SIGTERM'));
process.on('SIGINT', () => fahreHerunter('SIGINT'));
