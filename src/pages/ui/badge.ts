/**
 * Badges in BASIS-CSS-Sprache: .badge ist neutrale Herkunft/Fakt,
 * .badge-critical das Urteil „auffällig". Ausreißer werden IMMER als
 * Zeilen-Tönung (--outlier-flaeche via .row-outlier) PLUS Badge markiert,
 * nie über Farbe allein (siehe ausreisserBadge in format.ts).
 */
import { html, raw, LEER, type Html } from './html.js';

export function badge(text: string, kritisch = false): Html {
  return html`<span class="badge${kritisch ? raw(' badge-critical') : LEER}">${text}</span>`;
}

export type BadgeStatus = 'laufend' | 'fertig' | 'fehlgeschlagen' | 'aktiv' | 'inaktiv' | 'delistet';

export function statusBadge(text: string, status: BadgeStatus): Html {
  return html`<span class="status-badge status-${raw(status)}">${text}</span>`;
}
