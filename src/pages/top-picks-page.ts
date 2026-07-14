import { MIETE_BASIS_LABEL, type TopPickKandidat } from '../top-picks.js';
import { datumMedium, fmtRendite, nfEur0, nfEur2 } from './format.js';
import { escapeHtml, renderOhneDatenSeite, seite } from './layout.js';

/**
 * Top Picks: die aktiven Kauf-Objekte mit der höchsten geschätzten
 * Bruttorendite am Stichtag, filterbar per PLZ-Präfix. Die Miete ist eine
 * Gebietsschätzung (Kaskade PLZ → Bezirk → Kärnten) — die Basis steht als
 * neutraler Badge an jeder Zeile (Herkunft ist Fakt, kein Urteil). Der
 * Schalter „Ausreißer einbeziehen" (?ausreisser=an, wie im Dashboard) holt
 * PLZ-lokale Kauf-Ausreißer markiert ins Ranking zurück.
 */

export interface TopPicksDaten {
  /** Stichtag = lauf_datum des letzten fertigen Sweeps. */
  stichtag: string;
  picks: TopPickKandidat[];
  /** Gesetzter PLZ-Präfix-Filter (?plz=…). */
  filterPlz?: string;
  /**
   * true = ?flaeche_min/?flaeche_max bzw. ?zeitraum/?von/?bis stehen in der
   * URL (umgebogener Dashboard-Link): hier ohne Wirkung, das wird sichtbar
   * gesagt statt still verworfen.
   */
  flaecheIgnoriert?: boolean;
  zeitraumIgnoriert?: boolean;
  /** true = ?ausreisser=an: Kauf-Ausreißer im Ranking, Miet-Mediane unbereinigt. */
  ausreisserEinbeziehen: boolean;
  /** Ziel-Bruttorendite (Anteil), ab der die Rendite-Zelle als "gut" gilt. */
  zielRendite: number;
}

const TOP_PICKS_CSS = `
  /* Rendite ≥ Ziel: gleiche Gut-Töne wie die Dashboard-Kachel (tile-good). */
  .zelle-gut { background: var(--good-bg); }
  .gut { color: var(--good-text); font-weight: 600; }
  .feld-toggle label { display: flex; align-items: center; gap: 6px; font-weight: 400; }
  .feld-toggle .meta { margin: 0; font-size: 12px; }
`;

function filterleiste(daten: TopPicksDaten): string {
  const ignoriert = [
    ...(daten.flaecheIgnoriert === true ? ['Fläche'] : []),
    ...(daten.zeitraumIgnoriert === true ? ['Zeitraum'] : []),
  ];
  // Auch für nur-ignorierte Parameter: der Reset-Link ist der Weg zur
  // sauberen, teilbaren URL.
  const zuruecksetzen =
    daten.filterPlz !== undefined || daten.ausreisserEinbeziehen || ignoriert.length > 0
      ? '\n      <p class="meta"><a href="/top-picks">Filter zurücksetzen</a></p>'
      : '';
  const flaecheHinweis =
    ignoriert.length > 0
      ? `\n    <p class="meta">${
          ignoriert.length === 2
            ? 'Fläche- und Zeitraum-Filter wirken nur im Dashboard und werden'
            : `Der ${ignoriert[0]}-Filter wirkt nur im Dashboard und wird`
        } hier ignoriert.</p>`
      : '';
  return `    <form class="filterleiste" method="get" action="/top-picks">
      <div class="feld">
        <label for="f-plz">PLZ (Präfix)</label>
        <input type="text" id="f-plz" name="plz" inputmode="numeric" value="${escapeHtml(daten.filterPlz ?? '')}" placeholder="z. B. 9020 oder 95">
      </div>
      <div class="feld feld-toggle">
        <label><input type="checkbox" name="ausreisser" value="an"${daten.ausreisserEinbeziehen ? ' checked' : ''}> Ausreißer einbeziehen</label>
        <p class="meta"><a href="/methodik#ausreisser">Was zählt als Ausreißer?</a></p>
      </div>
      <button>Filtern</button>${zuruecksetzen}
    </form>${flaecheHinweis}`;
}

function pickZeile(p: TopPickKandidat, zielRendite: number, zielProzent: string): string {
  const titel = `${p.ort} · ${nfEur0.format(p.zimmer)} Zi.`;
  const link = p.url ? `<a href="${escapeHtml(p.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
  const ausreisserBadge = p.istAusreisser
    ? ' <span class="badge badge-critical">▲ Ausreißer</span>'
    : '';
  const erreicht = p.bruttoRendite >= zielRendite;
  // Urteils-Regel: Grün nur mit Text-Marker; unter Ziel bleibt die Zelle
  // neutral — eine niedrigere Rendite ist hier eine Lage, kein Fehler.
  // Ausreißer bekommen kein Chance-Grün: erst prüfen, dann urteilen.
  const renditeZelle =
    erreicht && !p.istAusreisser
      ? `<td class="num zelle-gut"><span class="gut">${fmtRendite(p.bruttoRendite)}</span><span class="sub">≥ Ziel ${zielProzent}</span></td>`
      : `<td class="num">${fmtRendite(p.bruttoRendite)}</td>`;
  return `        <tr${p.istAusreisser ? ' class="row-outlier"' : ''}>
          <td>${link}${ausreisserBadge}<span class="sub">${escapeHtml(p.portal)}</span></td>
          <td>${escapeHtml(p.plz)}<span class="sub">${escapeHtml(p.bezirk)}</span></td>
          <td class="num">${nfEur0.format(p.flaecheM2)} m²</td>
          <td class="num">${nfEur0.format(p.kaufpreis)} €</td>
          <td class="num">${nfEur0.format(p.eurM2)}</td>
          <td class="num">${nfEur2.format(p.medianMieteEurM2)}<span class="sub badge">${MIETE_BASIS_LABEL[p.mieteBasis]}</span></td>
          ${renditeZelle}
        </tr>`;
}

function tabelle(daten: TopPicksDaten, zielProzent: string): string {
  if (daten.picks.length === 0) {
    const imFilter =
      daten.filterPlz !== undefined
        ? ` im PLZ-Filter „${escapeHtml(daten.filterPlz)}" — <a href="/top-picks">Filter zurücksetzen</a> oder`
        : ' —';
    return `    <p class="meta">Keine Kauf-Objekte mit belastbarer Miet-Vergleichsbasis${imFilter}
    im <a href="/">Dashboard</a> den Gesamtmarkt ansehen.</p>`;
  }
  const zeilen = daten.picks.map((p) => pickZeile(p, daten.zielRendite, zielProzent)).join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Objekt</th><th scope="col">PLZ</th><th scope="col" class="num">Fläche</th><th scope="col" class="num">Kaufpreis</th><th scope="col" class="num">€/m² (Kauf)</th><th scope="col" class="num">Miete (€/m²)</th><th scope="col" class="num">Rendite</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

/** Top-Picks-Seite ohne Daten: noch kein fertiger Sweep (wie das Dashboard). */
export function renderTopPicksOhneDatenSeite(sweepLaeuft: boolean): string {
  return renderOhneDatenSeite({
    titel: 'Top Picks',
    aktiv: 'top-picks',
    ueberschrift: 'Top Picks',
    untertitel: `Die Kauf-Objekte mit der höchsten geschätzten Bruttorendite —
    sobald der erste Sweep Daten liefert.`,
    sweepLaeuft,
  });
}

export function renderTopPicksSeite(daten: TopPicksDaten): string {
  const zielProzent = `${(daten.zielRendite * 100).toLocaleString('de-AT')} %`;
  const filterZusatz =
    daten.filterPlz !== undefined
      ? ` · PLZ ${daten.filterPlz}${daten.filterPlz.length < 4 ? '…' : ''}`
      : '';
  const ausreisserZeile = daten.ausreisserEinbeziehen
    ? `Kauf-Objekte, die in ihrer PLZ als 1,5×IQR-Ausreißer gelten, sind einbezogen und
    mit „▲ Ausreißer" markiert; die Miet-Mediane rechnen unbereinigt.`
    : `Ohne Kauf-Objekte, die in ihrer PLZ als 1,5×IQR-Ausreißer gelten —
    ein fragwürdiger Preis ist kein Kaufsignal.`;
  const inhalt = `  <header>
    <h1>Top Picks — Bruttorendite je Objekt (Stichtag ${escapeHtml(datumMedium(daten.stichtag))})${escapeHtml(filterZusatz)}</h1>
    <p class="meta">Kauf-Objekte, sortiert nach geschätzter Bruttorendite. Die Miete kommt
    aus dem Median der Kaltmiete im Objekt-Gebiet (PLZ, sonst Bezirk oder Kärnten-Gesamt)
    — die Basis steht jeweils dabei. <a href="/methodik#top-picks">Details</a></p>
  </header>

  <section>
${filterleiste(daten)}
  </section>

  <section>
    <h2>${
      daten.picks.length > 0
        ? `Top ${nfEur0.format(daten.picks.length)} nach Bruttorendite`
        : 'Top Picks nach Bruttorendite'
    }</h2>
    <p class="meta">${ausreisserZeile} <a href="/methodik#top-picks">Details</a></p>
${tabelle(daten, zielProzent)}
  </section>`;
  return seite('Top Picks', inhalt, {
    breite: 'breit',
    aktiv: 'top-picks',
    extraCss: TOP_PICKS_CSS,
  });
}
