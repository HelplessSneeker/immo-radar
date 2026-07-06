import type { Suche, SucheStatus } from '../db/suchen-repo.js';
import { BUNDESLAENDER, type SuchKriterien } from '../search.js';
import { escapeHtml, seite } from './layout.js';

/** Seiten des Such-Lifecycles: Polling-Seite, Historie, Fehlseite. */

const nfZahl = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 });

function bereich(min: number | undefined, max: number | undefined, einheit: string): string | undefined {
  if (min !== undefined && max !== undefined) {
    return `${nfZahl.format(min)}–${nfZahl.format(max)}${einheit}`;
  }
  if (min !== undefined) return `ab ${nfZahl.format(min)}${einheit}`;
  if (max !== undefined) return `bis ${nfZahl.format(max)}${einheit}`;
  return undefined;
}

/** Kurzfassung der Kriterien für Historie und Gebiete, z. B. "Kärnten · Kauf · ab 50 m² · Villach". */
export function kriterienZusammenfassung(k: SuchKriterien): string {
  const typ = k.typ === 'beide' ? 'Kauf & Miete' : k.typ === 'kauf' ? 'Kauf' : 'Miete';
  const teile = [
    BUNDESLAENDER[k.bundesland] ?? k.bundesland,
    typ,
    bereich(k.preisMin, k.preisMax, ' €'),
    bereich(k.flaecheMin, k.flaecheMax, ' m²'),
    bereich(k.zimmerMin, k.zimmerMax, ' Zi.'),
    k.ort,
  ];
  return teile.filter((t): t is string => t !== undefined).join(' · ');
}

/** Freundlicher Status-Wortlaut – gilt auch für Crawl-Läufe (gleiche Zustände).
 *  Bei „laufend" liefert der Puls-Punkt des Badges den „…"-Cue visuell (siehe
 *  BASIS_CSS `.status-badge.status-laufend::before`); der Text bleibt trocken. */
export const STATUS_TEXT: Record<SucheStatus, string> = {
  laufend: 'läuft',
  fertig: 'fertig',
  fehlgeschlagen: 'fehlgeschlagen',
};

function statusBadge(status: SucheStatus): string {
  return `<span class="status-badge status-${status}">${STATUS_TEXT[status]}</span>`;
}

const nfZeit = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

function historieTabelle(suchen: Suche[]): string {
  const zeilen = suchen
    .map(
      (s) => `      <tr>
        <td class="meta">${nfZeit.format(s.erstelltAm)}</td>
        <td><a href="/suchen/${s.id}">${escapeHtml(kriterienZusammenfassung(s.kriterien))}</a></td>
        <td>${statusBadge(s.status)}</td>
        <td>${s.status === 'fertig' ? s.treffer : ''}</td>
      </tr>`,
    )
    .join('\n');
  return `    <div class="tabelle-scroll">
    <table class="historie">
      <thead><tr><th scope="col">Zeitpunkt</th><th scope="col">Suche</th><th scope="col">Status</th><th scope="col">Treffer</th></tr></thead>
      <tbody>
${zeilen}
      </tbody>
    </table>
    </div>`;
}

/** Historie-Block für die Startseite (ohne eigenes Seitengerüst). */
export function renderHistorieBlock(suchen: Suche[]): string {
  if (suchen.length === 0) return '';
  return `  <section>
    <h2>Letzte Suchen</h2>
${historieTabelle(suchen)}
    <p class="meta"><a href="/suchen">Alle Suchen →</a></p>
  </section>`;
}

export function renderHistorieSeite(suchen: Suche[]): string {
  const inhalt =
    suchen.length === 0
      ? '    <p>Noch keine Suchen. <a href="/suche">Erste Suche starten →</a></p>'
      : historieTabelle(suchen);
  // Wenn beim Rendern der Seite Suchen liefen, lohnt sich der Auto-Reload
  // sobald mindestens eine davon fertig ist – der neue Status kommt sonst
  // erst beim manuellen Nachladen.
  const hatLaufende = suchen.some((s) => s.status === 'laufend');
  const laufendIds = suchen
    .filter((s) => s.status === 'laufend')
    .map((s) => s.id)
    .join(',');
  const reloadSkript = hatLaufende
    ? `
  <script>
    // Reload nur, wenn eine ursprünglich laufende Suche NICHT mehr in der
    // Aktivität steht (= fertig oder fehlgeschlagen). Ohne Form-Elemente auf
    // dieser Seite ist ein Reload verlustfrei.
    (function () {
      const beobachtet = new Set([${laufendIds}]);
      document.addEventListener('aktivitaet-aenderung', function (e) {
        const laufend = new Set(e.detail.suchen.map(function (s) { return s.id; }));
        for (const id of beobachtet) {
          if (!laufend.has(id)) {
            document.body.classList.add('laufend-fade');
            setTimeout(function () { location.reload(); }, 240);
            return;
          }
        }
      });
    })();
  </script>`
    : '';
  return seite(
    'Suchhistorie',
    `  <header>
    <h1>Suchhistorie</h1>
    <p class="meta">Alle bisherigen Suchläufe, neueste zuerst.</p>
  </header>
  <section>
${inhalt}
  </section>${reloadSkript}`,
    { aktiv: 'suchen' },
  );
}

/**
 * Zusatz-CSS der laufenden Seite: kompakte Kopf-Zeile mit Timer neben H1,
 * dünner Fortschrittsbalken direkt unter der Überschrift, gedämpfter
 * Statusblock. Bewusst schlank – die Seite lebt vom Wartezustand, sie soll
 * nicht laut sein.
 */
const LAUFEND_CSS = `
  .laufend-kopf { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .laufend-kopf .laufzeit {
    color: var(--text-muted); font-size: 13px; font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .laufend-fortschritt { margin: 4px 0 16px; }
  .laufend-uebergang {
    transition: opacity var(--dauer-mittel) var(--ease-out);
  }
  body.laufend-fade .laufend-uebergang { opacity: 0.3; }
`;

export function renderLaufendSeite(suche: Suche): string {
  const startMs = (suche.beendetAm ?? suche.erstelltAm).getTime();
  return seite(
    'Suche läuft',
    `  <header class="laufend-uebergang">
    <div class="laufend-kopf">
      <h1>Suche läuft</h1>
      <span class="laufzeit" id="laufzeit" aria-live="off">0 s</span>
    </div>
    <div class="fortschritt laufend-fortschritt" role="progressbar" aria-label="Suche läuft" aria-valuetext="unbestimmt"></div>
  </header>
  <section class="laufend-uebergang">
    <p>${escapeHtml(kriterienZusammenfassung(suche.kriterien))}</p>
    <p class="meta" id="poll-status" role="status">willhaben.at und immoscout24.at werden durchsucht –
    das dauert ein paar Sekunden. Die Seite aktualisiert sich automatisch.</p>
    <p class="meta">Die Seite kann verlassen werden – der Suchlauf läuft im Hintergrund weiter und
    ist über den Aktivitäts-Chip im Kopf oder unter <a href="/suchen">Suchhistorie</a> jederzeit
    wieder erreichbar.</p>
  </section>
  <script>
    (function () {
      const start = ${startMs};
      const anzeige = document.getElementById('laufzeit');
      function fmt(sek) {
        if (sek < 60) return sek + ' s';
        const m = Math.floor(sek / 60), s = sek % 60;
        return m + ' min ' + (s < 10 ? '0' : '') + s + ' s';
      }
      function tick() {
        anzeige.textContent = fmt(Math.max(0, Math.round((Date.now() - start) / 1000)));
      }
      tick();
      const zeitgeber = setInterval(tick, 1000);
      const pollTimer = setInterval(async () => {
        try {
          const res = await fetch('/suchen/${suche.id}/status');
          const { status } = await res.json();
          if (status !== 'laufend') {
            clearInterval(pollTimer);
            clearInterval(zeitgeber);
            document.getElementById('poll-status').textContent = 'Fertig – das Ergebnis wird geladen.';
            // Sanfter Wechsel: erst ausblenden, dann Reload – der harte Cut wirkt sonst als „Ruckler".
            document.body.classList.add('laufend-fade');
            setTimeout(() => location.reload(), 240);
          }
        } catch { /* Server kurz nicht erreichbar – weiter pollen */ }
      }, 2000);
    })();
  </script>`,
    {
      aktiv: 'suchen',
      extraCss: LAUFEND_CSS,
      kopfExtra: '<noscript><meta http-equiv="refresh" content="4"></noscript>\n',
    },
  );
}

export function renderFehlgeschlagenSeite(suche: Suche): string {
  return seite(
    'Suche fehlgeschlagen',
    `  <header><h1 class="fehler">Suche fehlgeschlagen</h1></header>
  <section>
    <p>${escapeHtml(kriterienZusammenfassung(suche.kriterien))}</p>
    <p class="fehler">${escapeHtml(suche.fehler ?? 'Unbekannter Fehler.')}</p>
    <p><a href="/suche">← Neue Suche starten</a></p>
  </section>`,
    { aktiv: 'suchen' },
  );
}
