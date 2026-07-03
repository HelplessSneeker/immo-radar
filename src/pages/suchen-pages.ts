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

/** Freundlicher Status-Wortlaut – gilt auch für Crawl-Läufe (gleiche Zustände). */
export const STATUS_TEXT: Record<SucheStatus, string> = {
  laufend: 'läuft …',
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
  return seite(
    'Suchhistorie',
    `  <header>
    <h1>Suchhistorie</h1>
    <p class="meta">Alle bisherigen Suchläufe, neueste zuerst.</p>
  </header>
  <section>
${inhalt}
  </section>`,
    { aktiv: 'suchen' },
  );
}

export function renderLaufendSeite(suche: Suche): string {
  return seite(
    'Suche läuft',
    `  <header><h1>Suche läuft …</h1></header>
  <section>
    <p>${escapeHtml(kriterienZusammenfassung(suche.kriterien))}</p>
    <p class="meta" id="poll-status" role="status">willhaben.at und immoscout24.at werden durchsucht –
    das dauert ein paar Sekunden. Die Seite aktualisiert sich automatisch.</p>
    <p class="meta">Die Seite kann verlassen werden – der Suchlauf läuft im Hintergrund weiter.</p>
  </section>
  <script>
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/suchen/${suche.id}/status');
        const { status } = await res.json();
        if (status !== 'laufend') {
          clearInterval(timer);
          // Screenreader-Ankündigung, bevor die Seite neu lädt
          document.getElementById('poll-status').textContent = 'Fertig – das Ergebnis wird geladen.';
          location.reload();
        }
      } catch { /* Server kurz nicht erreichbar – weiter pollen */ }
    }, 2000);
  </script>`,
    { aktiv: 'suchen', kopfExtra: '<noscript><meta http-equiv="refresh" content="4"></noscript>\n' },
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
