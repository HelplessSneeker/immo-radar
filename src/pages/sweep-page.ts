import { bezirkName } from '../bezirke.js';
import type { SweepLauf, SweepSegment, SweepStatus } from '../db/sweep-repo.js';
import { datumMedium, nfEur0, nfTage } from './format.js';
import { escapeHtml, seite } from './layout.js';

/**
 * Beobachtbarkeit des täglichen Kärnten-Sweeps: alle Läufe plus die
 * Segmente des jüngsten Tages (Bezirk × Typ × Portal, ggf. Preisbänder) —
 * ehrlich darüber, was abgedeckt wurde und was nicht.
 */

export interface SweepSeitenDaten {
  laeufe: SweepLauf[];
  /** Segmente des jüngsten Laufs (laufend oder zuletzt beendet). */
  segmente: SweepSegment[];
  segmentDatum?: string;
}

const STATUS_TEXT: Record<SweepStatus, string> = {
  laufend: 'läuft',
  fertig: 'fertig',
  fehlgeschlagen: 'fehlgeschlagen',
};

function statusBadge(status: SweepStatus): string {
  return `<span class="status-badge status-${status}">${STATUS_TEXT[status]}</span>`;
}

function preisBandText(segment: SweepSegment): string {
  if (segment.preisMin === undefined && segment.preisMax === undefined) return 'gesamt';
  const teil = (n?: number) => (n === undefined ? '' : `${nfEur0.format(n)} €`);
  return `${teil(segment.preisMin)}–${teil(segment.preisMax)}`;
}

function laeufeTabelle(laeufe: SweepLauf[]): string {
  if (laeufe.length === 0) {
    return `    <p class="meta">Noch kein Sweep gelaufen – der erste startet automatisch
    (spätestens 30 Minuten nach Serverstart).</p>`;
  }
  const zeilen = laeufe
    .map(
      (l) => `      <tr>
        <td>${escapeHtml(datumMedium(l.laufDatum))}</td>
        <td>${statusBadge(l.status)}</td>
        <td class="num">${l.inserateGesehen !== undefined ? nfTage.format(l.inserateGesehen) : ''}</td>
        <td class="meta">${l.fehler ? escapeHtml(l.fehler) : ''}</td>
      </tr>`,
    )
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Tag</th><th scope="col">Status</th><th scope="col" class="num">Inserate</th><th scope="col">Fehler</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

function segmenteTabelle(segmente: SweepSegment[]): string {
  const zeilen = segmente
    .map((s) => {
      const abdeckung =
        s.inserateGeladen !== undefined && s.gesamtTreffer !== undefined
          ? `${nfTage.format(s.inserateGeladen)} / ${nfTage.format(s.gesamtTreffer)}`
          : '';
      // Bei "fehlgeschlagen" steht in der Quelle-Spalte die Fehlermeldung; die
      // darf nicht wie eine gedämpfte URL aussehen. Die Statusfarbe (Urteils-
      // Regel) darf hier hin, weil der Status "fehlgeschlagen" die Zelle zum
      // Fehlertext macht – kein Widerspruch zur "Farbe nur mit Urteil"-Regel.
      const quelleKlasse = s.status === 'fehlgeschlagen' ? 'fehler' : 'meta';
      return `      <tr>
        <td>${escapeHtml(s.portal)}</td>
        <td>${escapeHtml(bezirkName(s.bezirk))}</td>
        <td>${s.typ === 'kauf' ? 'Kauf' : 'Miete'}</td>
        <td class="num">${escapeHtml(preisBandText(s))}</td>
        <td>${statusBadge(s.status)}</td>
        <td class="num">${abdeckung}</td>
        <td class="${quelleKlasse}">${s.quelle ? escapeHtml(s.quelle) : ''}</td>
      </tr>`;
    })
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table>
      <thead><tr><th scope="col">Portal</th><th scope="col">Bezirk</th><th scope="col">Typ</th><th scope="col" class="num">Preisband</th><th scope="col">Status</th><th scope="col" class="num">geladen / Treffer</th><th scope="col">Quelle / Fehler</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

export function renderSweepSeite(daten: SweepSeitenDaten): string {
  const segmentSektion =
    daten.segmente.length > 0 && daten.segmentDatum !== undefined
      ? `
  <section>
    <h2>Segmente vom ${escapeHtml(datumMedium(daten.segmentDatum))}</h2>
    <p class="meta">Der Sweep zerlegt Kärnten in Bezirk × Typ × Portal; gesättigte Segmente
    (mehr Treffer als ladbar) werden zusätzlich in Preisbänder geteilt.</p>
${segmenteTabelle(daten.segmente)}
  </section>`
      : '';

  const inhalt = `  <header>
    <h1>Crawl-Läufe</h1>
    <p class="meta">Ein Sweep pro Tag über alle Kärntner Wohnungen (Kauf & Miete, beide
    Portale). Ein fehlgeschlagenes Segment kostet nie den ganzen Lauf – es fehlt dann
    nur dessen Ausschnitt.</p>
  </header>

  <section>
    <h2>Sweep-Läufe</h2>
${laeufeTabelle(daten.laeufe)}
  </section>
${segmentSektion}`;

  return seite('Crawl-Läufe', inhalt, { breite: 'breit', aktiv: 'crawl' });
}
