import type { BestandInserat } from '../db/bestand-repo.js';
import { datenqualitaetLabels } from '../plausibilitaet.js';
import type { PreisAenderung } from '../trend.js';
import { escapeHtml } from './layout.js';

/**
 * Gemeinsame Formatter und Zell-Bausteine der Bestand-Seiten (Gebiet-Detail,
 * Inseratsbestand, Crawl-Lauf-Detail). Reine Darstellung, keine Berechnung.
 */

export const nfEur0 = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
export const nfEur2 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const nfTage = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
export const nfPct = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });
export const nfZeit = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' });
export const nfZeitpunkt = new Intl.DateTimeFormat('de-AT', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const nfProzent2 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rendite-Anteil als Prozentwert, z. B. 0.0432 → „4,32 %". */
export function fmtRendite(anteil: number): string {
  return `${nfProzent2.format(anteil * 100)} %`;
}

/**
 * „▲ Ausreißer"-Badge einer Zeile (Dashboard-Datenpunkte, Top Picks):
 * Hard-Regel-Fälle tragen ihren Grund direkt am Badge, rein statistische
 * (IQR-)Ausreißer bleiben beim nackten „▲ Ausreißer". Leer, wenn die Zeile
 * kein Ausreißer ist; mit führendem Leerzeichen zum Ankleben an den Titel.
 */
export function ausreisserBadge(zeile: {
  istAusreisser: boolean;
  datenqualitaet?: string;
}): string {
  if (!zeile.istAusreisser) return '';
  const grund =
    zeile.datenqualitaet !== undefined
      ? ` · ${escapeHtml(datenqualitaetLabels(zeile.datenqualitaet))}`
      : '';
  return ` <span class="badge badge-critical">▲ Ausreißer${grund}</span>`;
}

const nfProzent1 = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Unter diesem Betrag (0,05 % bzw. 0,05 %-Pkt.) gilt ein Delta als „stabil":
 * fmtDelta rendert „±0,0 …" und die KPI-Kachel zeigt den →-Pfeil — eine
 * Konstante für beide, damit Pfeil und Text nie auseinanderlaufen.
 */
export const DELTA_STABIL_SCHWELLE = 0.0005;

/**
 * Delta-Anteil mit Vorzeichen: 0.023 → „+2,3 %" bzw. „+2,3 %-Pkt."
 * (prozentpunkte für Rendite-Deltas). Minus als U+2212 wie aenderungsZelle.
 */
export function fmtDelta(
  wert: number,
  einheit: 'prozent' | 'prozentpunkte',
  schwelle = DELTA_STABIL_SCHWELLE,
): string {
  const suffix = einheit === 'prozent' ? ' %' : ' %-Pkt.';
  if (Math.abs(wert) < schwelle) return `±0,0${suffix}`;
  const zeichen = wert < 0 ? '−' : '+';
  return `${zeichen}${nfProzent1.format(Math.abs(wert) * 100)}${suffix}`;
}

/** YYYY-MM-DD als lokales Datum formatieren (T00:00:00 verhindert UTC-Tagessprung). */
export function datumMedium(datum: string): string {
  return nfZeit.format(new Date(`${datum}T00:00:00`));
}

/** Titel-Zelle eines Bestand-Inserats: Ort + Zimmer als Portal-Link, Typ + ID als Sub. */
export function inseratZelle(i: BestandInserat): string {
  const titel = `${i.ort} · ${nfEur0.format(i.zimmer)} Zi.`;
  const link = i.url ? `<a href="${escapeHtml(i.url)}">${escapeHtml(titel)}</a>` : escapeHtml(titel);
  return `<td>${link}<span class="sub">${i.typ === 'kauf' ? 'Kauf' : 'Miete'} · ${escapeHtml(i.id)}</span></td>`;
}

/** €/m² – Kauf ganzzahlig, Miete mit 2 Nachkommastellen (wie die Chart-Achsen). */
export function eurM2Wert(i: BestandInserat): string {
  if (i.flaeche_m2 <= 0) return '–';
  const wert = i.preis / i.flaeche_m2;
  return i.typ === 'kauf' ? nfEur0.format(wert) : nfEur2.format(wert);
}

export function aenderungsZelle(a: PreisAenderung | undefined): string {
  if (!a || a.neuerPreis === a.alterPreis) return '<td class="num meta">–</td>';
  const delta = a.neuerPreis - a.alterPreis;
  const prozent = (Math.abs(delta) / a.alterPreis) * 100;
  // Käufer-Perspektive: Senkung = Chance (grün), Erhöhung = kritisch. Das
  // Vorzeichen trägt das Urteil auch ohne Farbe.
  const klasse = delta < 0 ? 'gesenkt' : 'gestiegen';
  const zeichen = delta < 0 ? '−' : '+';
  return `<td class="num"><span class="${klasse}">${zeichen}${nfPct.format(prozent)} % (${zeichen}${nfEur0.format(Math.abs(delta))} €)</span><span class="sub">${escapeHtml(datumMedium(a.geaendertAm))}</span></td>`;
}

/** Aufsteigend nach €/m² – günstigster Quadratmeterpreis zuerst; ohne Fläche ans Ende. */
export function nachEurM2(inserate: BestandInserat[]): BestandInserat[] {
  return [...inserate].sort((a, b) => {
    const ea = a.flaeche_m2 > 0 ? a.preis / a.flaeche_m2 : Infinity;
    const eb = b.flaeche_m2 > 0 ? b.preis / b.flaeche_m2 : Infinity;
    return ea - eb;
  });
}
