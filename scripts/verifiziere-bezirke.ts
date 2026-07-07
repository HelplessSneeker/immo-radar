/**
 * Dev-Skript: prüft Bezirk-Slug-Kandidaten gegen die Live-Portale — manuell
 * ausführen (nie in CI), Ergebnisse mit Datum in src/bezirke.ts eintragen:
 *
 *   pnpm exec tsx scripts/verifiziere-bezirke.ts
 *
 * Für jeden Kandidaten wird Seite 1 der Kauf-Suche geladen und geprüft, dass
 * das Portal 200 antwortet, die Seite parsebar ist und die Treffer plausibel
 * zum Bezirk gehören. Ein falscher Slug führt bei beiden Portalen zu 404.
 */
import { setTimeout as warte } from 'node:timers/promises';
import { BEZIRKE_KAERNTEN } from '../src/bezirke.js';
import { heutigesDatum } from '../src/datum.js';
import { extractNextData, extractSearchResult, mapPage as mapWillhaben } from '../src/willhaben/map.js';
import { extractInitialState, extractPageData, mapPage as mapIs24 } from '../src/immoscout24/map.js';
import { normalisiereOrt } from '../src/ort-slugs.js';

const PAUSE_MS = 2000;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

/** Kandidat = gesetzter Slug oder der normalisierte Bezirksname. */
function kandidat(slug: string | undefined, name: string): string {
  return slug ?? normalisiereOrt(name);
}

async function lade(url: string): Promise<{ status: number; html?: string }> {
  try {
    const antwort = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!antwort.ok) return { status: antwort.status };
    return { status: antwort.status, html: await antwort.text() };
  } catch (e) {
    console.error(`  Netzwerkfehler für ${url}: ${e instanceof Error ? e.message : e}`);
    return { status: 0 };
  }
}

function pruefeTreffer(bezirkName: string, bezirke: string[]): string {
  if (bezirke.length === 0) return 'keine Treffer mit Bezirk-Feld';
  const passend = bezirke.filter((b) =>
    normalisiereOrt(b).includes(normalisiereOrt(bezirkName).split('-')[0]!),
  ).length;
  return `${passend}/${bezirke.length} Treffer passen zum Bezirk`;
}

console.log('Bezirk-Slug-Verifikation (Kauf-Suche, Seite 1)\n');

for (const bezirk of BEZIRKE_KAERNTEN) {
  console.log(`## ${bezirk.name}`);

  const whSlug = kandidat(bezirk.willhaben, bezirk.name);
  const whUrl = `https://www.willhaben.at/iad/immobilien/eigentumswohnung/kaernten/${whSlug}`;
  const wh = await lade(whUrl);
  if (wh.html) {
    try {
      const ergebnis = extractSearchResult(extractNextData(wh.html));
      const inserate = mapWillhaben(ergebnis, 'kauf', heutigesDatum()).inserate;
      console.log(
        `  willhaben "${whSlug}": HTTP 200, ${ergebnis.rowsFound} Treffer, ` +
          pruefeTreffer(bezirk.name, inserate.map((i) => i.bezirk)),
      );
    } catch (e) {
      console.log(`  willhaben "${whSlug}": HTTP 200, aber nicht parsebar (${e instanceof Error ? e.message : e})`);
    }
  } else {
    console.log(`  willhaben "${whSlug}": HTTP ${wh.status} — Slug so nicht verwenden`);
  }
  await warte(PAUSE_MS);

  const isSlug = kandidat(bezirk.immoscout24, bezirk.name);
  const isUrl = `https://www.immoscout24.at/regional/kaernten/${isSlug}/wohnung-kaufen`;
  const is24 = await lade(isUrl);
  if (is24.html) {
    try {
      const daten = extractPageData(extractInitialState(is24.html));
      const inserate = mapIs24(daten, 'kauf', bezirk.name, heutigesDatum()).inserate;
      console.log(
        `  immoscout24 "${isSlug}": HTTP 200, ${daten.totalHits} Treffer, ${inserate.length} parsebar`,
      );
    } catch (e) {
      console.log(`  immoscout24 "${isSlug}": HTTP 200, aber nicht parsebar (${e instanceof Error ? e.message : e})`);
    }
  } else {
    console.log(`  immoscout24 "${isSlug}": HTTP ${is24.status} — Slug so nicht verwenden`);
  }
  await warte(PAUSE_MS);
}

console.log('\nVerifizierte Slugs mit Datum in src/bezirke.ts eintragen.');
