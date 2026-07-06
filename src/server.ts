import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import process from 'node:process';
import { analyze } from './analyze.js';
import { ImmoScout24Adapter } from './adapters/immoscout24-adapter.js';
import type { PortalAdapter } from './adapters/portal-adapter.js';
import { WillhabenAdapter } from './adapters/willhaben-adapter.js';
import { tageZwischen } from './datum.js';
import {
  bestandLaden,
  bestandSeiteLaden,
  preisHistorieFuerInserate,
  preisHistorieLaden,
  type BestandInserat,
} from './db/bestand-repo.js';
import { holePool } from './db/client.js';
import {
  crawlLaeufeAuflisten,
  crawlLaufLaden,
  gebietAktivieren,
  gebietAnlegen,
  gebietDeaktivieren,
  gebieteAuflisten,
  gebietLaden,
  gebietLoeschen,
  laufendeCrawls,
  laufendeCrawlsMitNamen,
  letzteFertigeLaeufe,
  letzterFertigerLauf,
  letzterFertigerLaufVor,
  zombieCrawlLaeufeBereinigen,
  type CrawlLauf,
  type FertigerLauf,
  type Gebiet,
} from './db/gebiete-repo.js';
import { wendeMigrationenAn } from './db/migrieren.js';
import {
  inserateLaden,
  laufendeSuchen,
  sucheAnlegen,
  sucheLaden,
  suchenAuflisten,
  zombieSuchenBereinigen,
  type Suche,
} from './db/suchen-repo.js';
import { renderLaufSeite } from './pages/crawl-lauf-page.js';
import {
  renderGebieteSeite,
  renderGebietOhneDatenSeite,
  renderGebietSeite,
  type GebietKennzahlen,
  type LaufVeraenderungen,
} from './pages/gebiete-pages.js';
import { renderInserateSeite } from './pages/inserate-page.js';
import {
  renderFehlerSeite,
  renderKeineTrefferSeite,
  renderSearchPage,
  type FormFehler,
} from './pages/search-page.js';
import {
  kriterienZusammenfassung,
  renderFehlgeschlagenSeite,
  renderHistorieSeite,
  renderLaufendSeite,
} from './pages/suchen-pages.js';
import { renderMethodikSeite } from './pages/methodik-page.js';
import { renderReport, ZIEL_RENDITE } from './report.js';
import { starteGebietCrawl, starteZeitplan } from './scheduler.js';
import {
  BUNDESLAENDER,
  filterInserate,
  parseGebietForm,
  parseInserateAnfrage,
  parseSuchKriterien,
  SuchKriterienFehler,
} from './search.js';
import { starteSuchlauf } from './suchlauf.js';
import {
  berechneLaufDiff,
  berechneRendite,
  berechneTrend,
  letztePreisAenderungen,
  vermarktungsdauer,
} from './trend.js';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 16 * 1024;

/** Fenster der „Kürzlich delistet"-Tabelle auf der Gebiet-Detailseite. */
const DELISTET_FENSTER_TAGE = 14;

/** Zeilen pro Seite der Bestand-Tabelle (/inserate). */
const INSERATE_PRO_SEITE = 50;

/** Crawl-Läufe auf der Gebiet-Detailseite. */
const MAX_LAEUFE = 10;

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

/**
 * Die Inserate eines Gebiets aus dem rohen Bundesland-Bestand: erst der
 * Gebiet-Typ, dann die Kriterien filtern (read-seitig). Gebiet-Detailseite
 * und Crawl-Lauf-Seite teilen sich diese eine Definition von „im Gebiet".
 */
function gebietInserate(gebiet: Gebiet, bestand: BestandInserat[]): BestandInserat[] {
  const nachTyp =
    gebiet.kriterien.typ === 'beide'
      ? bestand
      : bestand.filter((i) => i.typ === gebiet.kriterien.typ);
  return filterInserate(nachTyp, gebiet.kriterien);
}

/**
 * Veränderungs-Zähler je sichtbarem fertigen Lauf für die Läufe-Tabelle.
 * Der Vorgänger-Lauf wird nur im geladenen Fenster gesucht: Ist die Liste
 * voll (limit erreicht) und kein fertiger Vorgänger darin, bleibt der Lauf
 * ohne Zähler („–") statt mit falschem Fenster zu rechnen; ist die Liste
 * nicht voll, war es wirklich der erste Lauf des Gebiets.
 */
function laufVeraenderungenBerechnen(
  laeufeAlle: CrawlLauf[],
  sichtbare: CrawlLauf[],
  inserate: BestandInserat[],
  historie: Parameters<typeof berechneLaufDiff>[1],
  fensterVoll: boolean,
): Map<number, LaufVeraenderungen> {
  const zaehler = new Map<number, LaufVeraenderungen>();
  for (const lauf of sichtbare) {
    if (lauf.status !== 'fertig') continue;
    const vorher = laeufeAlle.find(
      (l) => l.status === 'fertig' && l.laufDatum < lauf.laufDatum,
    );
    if (!vorher && fensterVoll) continue;
    const diff = berechneLaufDiff(inserate, historie, lauf.laufDatum, vorher?.laufDatum);
    zaehler.set(lauf.id, {
      neu: diff.neue.length,
      delistet: diff.delistete.length,
      preise: diff.preisAenderungen.length,
    });
  }
  return zaehler;
}

/**
 * Kennzahlen je Gebiet für die Übersichts-Tabelle: aktive Inserate und die
 * Wochen-Tendenz des Median-€/m². Bestand und Historie werden je Bundesland
 * genau einmal geladen, egal wie viele Gebiete darin liegen.
 */
async function gebieteKennzahlen(
  gebiete: Gebiet[],
  letzteLaeufe: Map<number, FertigerLauf>,
): Promise<Map<number, GebietKennzahlen>> {
  const kennzahlen = new Map<number, GebietKennzahlen>();
  const mitLauf = gebiete.filter((g) => letzteLaeufe.has(g.id));
  const laender = [...new Set(mitLauf.map((g) => g.kriterien.bundesland))];
  const jeLand = new Map<
    string,
    { bestand: BestandInserat[]; historie: Awaited<ReturnType<typeof preisHistorieLaden>> }
  >();
  for (const land of laender) {
    const [bestand, historie] = await Promise.all([
      bestandLaden(land),
      preisHistorieLaden(land),
    ]);
    jeLand.set(land, { bestand, historie });
  }

  for (const gebiet of mitLauf) {
    const daten = jeLand.get(gebiet.kriterien.bundesland)!;
    const stichtag = letzteLaeufe.get(gebiet.id)!.laufDatum;
    const inserate = gebietInserate(gebiet, daten.bestand);
    const aktive = inserate.filter((i) => i.zuletztGesehen >= stichtag);

    // Leit-Serie der Tendenz: die Miete nur, wenn das Gebiet ein reines
    // Miet-Gebiet ist – sonst ist der Kaufmarkt die Anlage-Perspektive.
    const serie = gebiet.kriterien.typ === 'miete' ? ('miete' as const) : ('kauf' as const);
    const trend = berechneTrend(inserate, daten.historie, stichtag);
    let tendenz: GebietKennzahlen['tendenz'] = null;
    if (trend.length >= 2) {
      const letzter = trend[trend.length - 1]!;
      const vorwoche = trend[trend.length - 2]!;
      const neu = serie === 'kauf' ? letzter.medianKaufEurM2 : letzter.medianMieteEurM2;
      const alt = serie === 'kauf' ? vorwoche.medianKaufEurM2 : vorwoche.medianMieteEurM2;
      if (neu !== null && alt !== null && alt > 0) {
        tendenz = { serie, deltaProzent: ((neu - alt) / alt) * 100 };
      }
    }

    kennzahlen.set(gebiet.id, {
      aktive: aktive.length,
      aktiveKauf: aktive.filter((i) => i.typ === 'kauf').length,
      aktiveMiete: aktive.filter((i) => i.typ === 'miete').length,
      tendenz,
    });
  }
  return kennzahlen;
}

/** Die Startseite (Gebiete-Übersicht) – geteilt von GET / und dem POST-Fehlerpfad. */
async function gebieteSeite(fehler?: FormFehler): Promise<string> {
  const [gebiete, laufende, letzteLaeufe] = await Promise.all([
    gebieteAuflisten(),
    laufendeCrawls(),
    letzteFertigeLaeufe(),
  ]);
  const kennzahlen = await gebieteKennzahlen(gebiete, letzteLaeufe);
  return renderGebieteSeite(gebiete, laufende, letzteLaeufe, kennzahlen, fehler);
}

/**
 * Auswertung eines Gebiets aus dem historisierten Bestand: Stichtag ist der
 * letzte erfolgreiche Crawl-Lauf, aktiv = damals noch gesehen. Der Gebiet-Typ
 * und die Kriterien filtern erst hier (read-seitig), der Bestand ist roh.
 */
async function gebietSeite(
  gebiet: Gebiet,
  alsReport: boolean,
  alleAnzeigen = false,
): Promise<string> {
  const crawlLaeuft = (await laufendeCrawls()).has(gebiet.id);
  const lauf = await letzterFertigerLauf(gebiet.id);
  if (!lauf) return renderGebietOhneDatenSeite(gebiet, crawlLaeuft);
  const stichtag = lauf.laufDatum;

  const bestand = await bestandLaden(gebiet.kriterien.bundesland);
  const inserate = gebietInserate(gebiet, bestand);
  const aktive = inserate.filter((i) => i.zuletztGesehen >= stichtag);

  if (alsReport) {
    if (aktive.length === 0) return renderKeineTrefferSeite([`Bestand, Stand ${stichtag}`]);
    return renderReport(analyze(aktive), {
      quellen: [`Bestand, Stand ${stichtag} (${aktive.length} aktive Inserate)`],
      erstellt: stichtag,
      region: gebiet.name,
      navAktiv: 'gebiete',
      zurueck: { href: `/gebiete/${gebiet.id}`, label: `← Zurück zum Gebiet „${gebiet.name}“` },
    });
  }

  const historie = await preisHistorieLaden(gebiet.kriterien.bundesland);
  const delisted = inserate.filter((i) => i.zuletztGesehen < stichtag);
  const kuerzlichDelistet = delisted.filter(
    (i) => tageZwischen(i.zuletztGesehen, stichtag) <= DELISTET_FENSTER_TAGE,
  );
  // Einen Lauf mehr laden als angezeigt wird: der älteste sichtbare braucht
  // seinen Vorgänger für den Veränderungs-Zähler.
  const laeufeAlle = await crawlLaeufeAuflisten(gebiet.id, MAX_LAEUFE + 1);
  const laeufe = laeufeAlle.slice(0, MAX_LAEUFE);
  return renderGebietSeite(
    gebiet,
    {
      stichtag,
      beendetAm: lauf.beendetAm,
      trend: berechneTrend(inserate, historie, stichtag),
      vermarktung: vermarktungsdauer(delisted),
      rendite: berechneRendite(aktive),
      aktive,
      delistete: kuerzlichDelistet,
      delistetFensterTage: DELISTET_FENSTER_TAGE,
      aenderungen: letztePreisAenderungen(historie),
      alleAnzeigen,
      laeufe,
      laufVeraenderungen: laufVeraenderungenBerechnen(
        laeufeAlle,
        laeufe,
        inserate,
        historie,
        laeufeAlle.length > MAX_LAEUFE,
      ),
      anzahlDelisted: delisted.length,
    },
    crawlLaeuft,
  );
}

/**
 * Detailseite eines Crawl-Laufs: für fertige Läufe die Tages-Veränderungen
 * (Gebiet-gefiltert, wie die Detailseite), sonst nur die Lauf-Metadaten.
 */
async function laufSeite(gebiet: Gebiet, lauf: CrawlLauf): Promise<string> {
  if (lauf.status !== 'fertig') return renderLaufSeite(gebiet, lauf, undefined);
  const vorheriger = await letzterFertigerLaufVor(gebiet.id, lauf.laufDatum);
  const [bestand, historie] = await Promise.all([
    bestandLaden(gebiet.kriterien.bundesland),
    preisHistorieLaden(gebiet.kriterien.bundesland),
  ]);
  const inserate = gebietInserate(gebiet, bestand);
  const diff = berechneLaufDiff(inserate, historie, lauf.laufDatum, vorheriger?.laufDatum);
  return renderLaufSeite(
    gebiet,
    lauf,
    { diff, ersterLauf: vorheriger === undefined },
    vorheriger?.laufDatum,
  );
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
  return renderReport(ergebnis, { quellen: suche.quellen, erstellt, region, navAktiv: 'suchen' });
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
      if (url.pathname === '/suchen') {
        // Bei ungültigen Kriterien das Formular mit den Eingaben re-rendern,
        // statt sie auf einer generischen Fehlerseite zu verlieren.
        const werte = new URLSearchParams(await liesBody(req));
        let kriterien;
        try {
          kriterien = parseSuchKriterien(werte);
        } catch (err) {
          if (err instanceof SuchKriterienFehler) {
            sende(res, 400, renderSearchPage(await suchenAuflisten(10), { werte, meldung: err.message }));
            return;
          }
          throw err;
        }
        const id = await sucheAnlegen(kriterien);
        console.log(`Suche ${id} gestartet: ${JSON.stringify(kriterien)}`);
        starteSuchlauf(id, kriterien, portale);
        res.writeHead(303, { location: `/suchen/${id}` });
        res.end();
        return;
      }
      if (url.pathname === '/gebiete') {
        const werte = new URLSearchParams(await liesBody(req));
        let form;
        try {
          form = parseGebietForm(werte);
        } catch (err) {
          if (err instanceof SuchKriterienFehler) {
            sende(res, 400, await gebieteSeite({ werte, meldung: err.message }));
            return;
          }
          throw err;
        }
        const id = await gebietAnlegen(form.name, form.kriterien);
        console.log(`Gebiet ${id} angelegt: "${form.name}" ${JSON.stringify(form.kriterien)}`);
        res.writeHead(303, { location: '/' });
        res.end();
        return;
      }
      const aktion = /^\/gebiete\/(\d+)\/(aktivieren|deaktivieren|aktualisieren|loeschen)$/.exec(
        url.pathname,
      );
      if (aktion) {
        const id = Number(aktion[1]);
        const gebiet = await gebietLaden(id);
        if (!gebiet) {
          sende(res, 404, renderFehlerSeite(404, `Es gibt kein Gebiet ${aktion[1]}.`));
          return;
        }
        if (aktion[2] === 'aktualisieren') {
          const gestartet = await starteGebietCrawl(gebiet, portale);
          console.log(
            gestartet
              ? `Gebiet ${id} ("${gebiet.name}"): manueller Crawl gestartet.`
              : `Gebiet ${id} ("${gebiet.name}"): Crawl läuft bereits.`,
          );
          res.writeHead(303, { location: `/gebiete/${id}` });
          res.end();
          return;
        }
        if (aktion[2] === 'loeschen') {
          await gebietLoeschen(id);
          console.log(`Gebiet ${id} ("${gebiet.name}") gelöscht.`);
          res.writeHead(303, { location: '/' });
          res.end();
          return;
        }
        await (aktion[2] === 'aktivieren' ? gebietAktivieren(id) : gebietDeaktivieren(id));
        res.writeHead(303, { location: '/' });
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
      // Kompakte Antwort für den Aktivitäts-Indikator im Kopf: welche Suchen
      // und welche Gebiets-Crawls laufen gerade? Client pollt alle paar Sekunden.
      const [suchen, crawls] = await Promise.all([laufendeSuchen(), laufendeCrawlsMitNamen()]);
      sendeJson(res, 200, {
        suchen: suchen.map((s) => ({ id: s.id, beschreibung: kriterienZusammenfassung(s.kriterien) })),
        crawls,
      });
      return;
    }

    if (url.pathname === '/') {
      sende(res, 200, await gebieteSeite());
      return;
    }
    if (url.pathname === '/suche') {
      sende(res, 200, renderSearchPage(await suchenAuflisten(10)));
      return;
    }
    if (url.pathname === '/suchen') {
      sende(res, 200, renderHistorieSeite(await suchenAuflisten()));
      return;
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
      sende(
        res,
        200,
        renderMethodikSeite({ delistetFensterTage: DELISTET_FENSTER_TAGE, zielRendite: ZIEL_RENDITE }),
      );
      return;
    }
    if (url.pathname === '/gebiete') {
      // Alte Lesezeichen: die Gebiete-Liste ist jetzt die Startseite.
      res.writeHead(301, { location: '/' });
      res.end();
      return;
    }
    const laufTreffer = /^\/gebiete\/(\d+)\/laeufe\/(\d+)$/.exec(url.pathname);
    if (laufTreffer) {
      const gebiet = await gebietLaden(Number(laufTreffer[1]));
      if (!gebiet) {
        sende(res, 404, renderFehlerSeite(404, `Es gibt kein Gebiet ${laufTreffer[1]}.`));
        return;
      }
      const lauf = await crawlLaufLaden(gebiet.id, Number(laufTreffer[2]));
      if (!lauf) {
        sende(
          res,
          404,
          renderFehlerSeite(404, `Es gibt keinen Crawl-Lauf ${laufTreffer[2]} für dieses Gebiet.`),
        );
        return;
      }
      sende(res, 200, await laufSeite(gebiet, lauf));
      return;
    }
    const gebietTreffer = /^\/gebiete\/(\d+)(\/report)?$/.exec(url.pathname);
    if (gebietTreffer) {
      const gebiet = await gebietLaden(Number(gebietTreffer[1]));
      if (!gebiet) {
        sende(res, 404, renderFehlerSeite(404, `Es gibt kein Gebiet ${gebietTreffer[1]}.`));
        return;
      }
      const alleAnzeigen = url.searchParams.get('inserate') === 'alle';
      sende(res, 200, await gebietSeite(gebiet, Boolean(gebietTreffer[2]), alleAnzeigen));
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
const zombieLaeufe = await zombieCrawlLaeufeBereinigen();
if (zombieLaeufe > 0) {
  console.log(`${zombieLaeufe} unterbrochene(r) Gebiet-Crawl(s) als fehlgeschlagen markiert.`);
}
starteZeitplan(portale);

server.listen(PORT, () => {
  console.log(`immo-radar läuft: http://localhost:${PORT}`);
});
