import type { BestandInserat } from '../db/bestand-repo.js';
import type { CrawlLauf, Gebiet } from '../db/gebiete-repo.js';
import { tageZwischen } from '../datum.js';
import type { LaufDiff, LaufPreisAenderung } from '../trend.js';
import {
  datumMedium,
  eurM2Wert,
  inseratZelle,
  nachEurM2,
  nfEur0,
  nfPct,
  nfTage,
  nfZeitpunkt,
} from './format.js';
import { CRAWL_BADGE, refreshBeiCrawl } from './gebiete-pages.js';
import { escapeHtml, seite } from './layout.js';
import { STATUS_TEXT } from './suchen-pages.js';

/**
 * Detailseite eines Crawl-Laufs: Metadaten plus die Tages-Veränderungen im
 * Gebiet (neu / delistet / Preisänderungen), rekonstruiert aus Bestand und
 * Preishistorie. Für nicht-fertige Läufe (laufend, fehlgeschlagen) gibt es
 * nur die Metadaten – Veränderungsdaten existieren dann nicht.
 */

export interface LaufSeitenDaten {
  diff: LaufDiff;
  /** true = kein früherer fertiger Lauf – alles Gesehene ist neu. */
  ersterLauf: boolean;
}

function dauerText(lauf: CrawlLauf): string | undefined {
  if (!lauf.beendetAm) return undefined;
  const sekunden = Math.max(0, Math.round((lauf.beendetAm.getTime() - lauf.gestartetAm.getTime()) / 1000));
  if (sekunden < 60) return `${sekunden} Sek.`;
  return `${Math.round(sekunden / 60)} Min.`;
}

function metaZeile(lauf: CrawlLauf): string {
  const teile = [
    `<span class="status-badge status-${lauf.status}">${STATUS_TEXT[lauf.status]}</span>`,
    `gestartet ${escapeHtml(nfZeitpunkt.format(lauf.gestartetAm))}`,
  ];
  const dauer = dauerText(lauf);
  if (dauer) teile.push(`Dauer ${escapeHtml(dauer)}`);
  if (lauf.quellen.length > 0) teile.push(`Quellen: ${lauf.quellen.map(escapeHtml).join(' · ')}`);
  if (lauf.inserateGesehen !== undefined) {
    teile.push(`${nfEur0.format(lauf.inserateGesehen)} Inserate gesehen (roh, vor Gebiets-Filter)`);
  }
  return teile.join(' · ');
}

function neueTabelle(neue: BestandInserat[]): string {
  const zeilen = nachEurM2(neue)
    .map(
      (i) => `      <tr>
        ${inseratZelle(i)}
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${nfEur0.format(i.flaeche_m2)} m²</td>
        <td class="num">${eurM2Wert(i)}</td>
      </tr>`,
    )
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">Preis</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">€/m²</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function delisteteTabelle(delistete: BestandInserat[]): string {
  const sortiert = [...delistete].sort((a, b) => b.zuletztGesehen.localeCompare(a.zuletztGesehen));
  const zeilen = sortiert
    .map(
      (i) => `      <tr>
        ${inseratZelle(i)}
        <td class="num">${nfEur0.format(i.preis)} €</td>
        <td class="num">${eurM2Wert(i)}</td>
        <td>${escapeHtml(datumMedium(i.zuerstGesehen))} – ${escapeHtml(datumMedium(i.zuletztGesehen))}</td>
        <td class="num">${nfTage.format(tageZwischen(i.zuerstGesehen, i.zuletztGesehen))}</td>
      </tr>`,
    )
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">letzter Preis</th><th scope="col" class="num">€/m²</th><th scope="col">online von–bis</th><th scope="col" class="num">Tage</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function preisAenderungenTabelle(aenderungen: LaufPreisAenderung[]): string {
  // Größte Senkung zuerst – aus Käufer-Sicht die interessanteste Zeile oben.
  const sortiert = [...aenderungen].sort(
    (a, b) =>
      (a.neuerPreis - a.alterPreis) / a.alterPreis - (b.neuerPreis - b.alterPreis) / b.alterPreis,
  );
  const zeilen = sortiert
    .map((a) => {
      const i = a.inserat;
      const delta = a.neuerPreis - a.alterPreis;
      const prozent = (Math.abs(delta) / a.alterPreis) * 100;
      const klasse = delta < 0 ? 'gesenkt' : 'gestiegen';
      const zeichen = delta < 0 ? '−' : '+';
      return `      <tr>
        ${inseratZelle(i)}
        <td class="num">${nfEur0.format(a.alterPreis)} €</td>
        <td class="num">${nfEur0.format(a.neuerPreis)} €</td>
        <td class="num"><span class="${klasse}">${zeichen}${nfPct.format(prozent)} % (${zeichen}${nfEur0.format(Math.abs(delta))} €)</span></td>
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Inserat</th><th scope="col" class="num">alter Preis</th><th scope="col" class="num">neuer Preis</th><th scope="col" class="num">Änderung</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function diffSektionen(gebiet: Gebiet, lauf: CrawlLauf, daten: LaufSeitenDaten): string {
  const { diff, ersterLauf } = daten;

  const neuVorbemerkung = ersterLauf
    ? `\n    <p class="meta">Erster Lauf dieses Gebiets – alle ${nfEur0.format(diff.neue.length)} Inserate
    wurden neu aufgenommen; Delistings und Preisänderungen kann es noch nicht geben.</p>`
    : '';
  const neu = `  <section>
    <h2>Neu aufgenommen (${nfEur0.format(diff.neue.length)})</h2>${neuVorbemerkung}
${diff.neue.length > 0 ? neueTabelle(diff.neue) : '    <p class="meta">Keine neuen Inserate an diesem Tag.</p>'}
  </section>`;

  if (ersterLauf) return neu;

  const delistet = `  <section>
    <h2>Delistet (${nfEur0.format(diff.delistete.length)})</h2>
${diff.delistete.length > 0 ? delisteteTabelle(diff.delistete) : '    <p class="meta">Keine Delistings an diesem Tag.</p>'}
  </section>`;

  const preise = `  <section>
    <h2>Preisänderungen (${nfEur0.format(diff.preisAenderungen.length)})</h2>
${diff.preisAenderungen.length > 0 ? preisAenderungenTabelle(diff.preisAenderungen) : '    <p class="meta">Keine Preisänderungen an diesem Tag.</p>'}
  </section>`;

  return `${neu}

${delistet}

${preise}`;
}

export function renderLaufSeite(
  gebiet: Gebiet,
  lauf: CrawlLauf,
  daten: LaufSeitenDaten | undefined,
  vorherigesLaufDatum?: string,
): string {
  const laeuft = lauf.status === 'laufend';

  let rumpf: string;
  if (daten) {
    const vergleich = daten.ersterLauf
      ? 'Veränderungen aus Bestand und Preishistorie rekonstruiert.'
      : `Veränderungen ggü. dem vorigen fertigen Lauf (${escapeHtml(datumMedium(vorherigesLaufDatum ?? ''))}),
    rekonstruiert aus Bestand und Preishistorie – Kriterien-gefiltert wie die Gebiets-Auswertung.`;
    rumpf = `${diffSektionen(gebiet, lauf, daten)}

  <footer class="meta">
    <p>${vergleich} <a href="/methodik#datenbasis">Methodik</a></p>
  </footer>`;
  } else if (laeuft) {
    rumpf = `  <section>
    <div class="fortschritt" role="progressbar" aria-label="Crawl läuft" aria-valuetext="unbestimmt" style="margin-bottom: 12px;"></div>
    <p class="meta" role="status">${CRAWL_BADGE} · Dieser Lauf ist noch nicht fertig.
    Die Seite aktualisiert sich automatisch, sobald er abgeschlossen ist.</p>
  </section>`;
  } else {
    rumpf = `  <section>
    ${lauf.fehler ? `<p class="fehler">${escapeHtml(lauf.fehler)}</p>` : ''}
    <p class="meta">Für fehlgeschlagene Läufe gibt es keine Veränderungsdaten.</p>
  </section>`;
  }

  const inhalt = `  <header>
    <p class="meta"><a href="/gebiete/${gebiet.id}">← Zurück zu „${escapeHtml(gebiet.name)}“</a></p>
    <h1>Crawl-Lauf ${escapeHtml(datumMedium(lauf.laufDatum))}</h1>
    <p class="meta">${metaZeile(lauf)}</p>
  </header>

${rumpf}`;

  return seite(`Crawl-Lauf ${lauf.laufDatum} · ${gebiet.name}`, inhalt, {
    breite: 'breit',
    aktiv: 'gebiete',
    kopfExtra: refreshBeiCrawl(laeuft, gebiet.id),
  });
}
