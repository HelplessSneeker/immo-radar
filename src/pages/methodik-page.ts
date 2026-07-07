import {
  BAUJAHR_TOLERANZ,
  FLAECHE_TOLERANZ_M2,
  KAUF_PREIS_TOLERANZ,
  MIETE_PREIS_TOLERANZ,
  MIETE_PREIS_TOLERANZ_EUR,
  RELISTING_MAX_LUECKE_TAGE,
  RELISTING_PREIS_TOLERANZ,
} from '../matching.js';
import { MIN_VERGLEICHSOBJEKTE } from '../portfolio-vergleich.js';
import { fmtRendite, nfPct } from './format.js';
import { escapeHtml, seite } from './layout.js';

/**
 * Zentrale Erklärseite aller Kennzahlen: was sie bedeuten, wie sie berechnet
 * werden, wo ihre Grenzen liegen. Die Auswertungsseiten verlinken per Anker
 * hierher (#datenbasis, #objekte, …) – die Anker-IDs sind deshalb Vertrag,
 * nicht Deko. Die Schwellenwerte kommen aus dem Code (matching.ts,
 * portfolio-vergleich.ts), damit der Text wahr bleibt, wenn sie sich ändern.
 * Bewusst ohne Navbar-Markierung (Referenz, kein Arbeitsfluss) und in
 * Schmalbreite (Prosa).
 */

export interface MethodikParameter {
  /** Ziel-Bruttorendite als Anteil, z. B. 0.04. */
  zielRendite: number;
}

const METHODIK_CSS = `
  .methodik-abschnitt h2 { margin-bottom: 8px; }
  .methodik-abschnitt p { margin: 6px 0; max-width: 65ch; }
  .methodik-abschnitt p strong { font-size: 13px; }
  .beispiel {
    color: var(--text-secondary); font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  /* Sprungziel nicht unter der Sticky-Navbar verstecken. */
  section[id] { scroll-margin-top: 64px; }
`;

interface Abschnitt {
  id: string;
  titel: string;
  inhalt: string;
}

function abschnitte(p: MethodikParameter): Abschnitt[] {
  const zielProzent = escapeHtml(fmtRendite(p.zielRendite));
  const kaufToleranz = escapeHtml(nfPct.format(KAUF_PREIS_TOLERANZ * 100));
  const mieteToleranz = escapeHtml(nfPct.format(MIETE_PREIS_TOLERANZ * 100));
  const relistingToleranz = escapeHtml(nfPct.format(RELISTING_PREIS_TOLERANZ * 100));
  return [
    {
      id: 'datenbasis',
      titel: 'Datenbasis: der tägliche Kärnten-Sweep',
      inhalt: `
    <p><strong>Was ist das?</strong> Einmal täglich crawlt immo-radar <em>alle</em> Wohnungs-Inserate
    Kärntens (Kauf und Miete) auf willhaben.at und immoscout24.at. Damit die Portal-Limits
    (≈450 bzw. ≈225 Inserate pro Abfrage) nicht zur Stichprobe zwingen, ist der Sweep in
    Segmente zerlegt: je politischem Bezirk, Typ und Portal; liefert ein Segment trotzdem mehr
    Treffer als ladbar, wird es zusätzlich in Preisbänder geteilt. Jedes gefundene Inserat
    bekommt eine Zeile im historisierten Bestand – wann es zuerst und zuletzt gesehen wurde
    und wie sich sein Preis entwickelt hat.</p>
    <p><strong>Grenzen:</strong> Gecrawlt wird einmal täglich – ein Inserat, das am selben Tag
    erscheint und wieder verschwindet, bleibt unsichtbar. Fällt ein Portal aus, fehlt nur der
    Ausschnitt der betroffenen Segmente (sichtbar unter <a href="/crawl">Crawl-Läufe</a>);
    „zuletzt gesehen" wird je Portal gemessen, ein Portal-Ausfall lässt dessen Inserate also
    nicht fälschlich als delistet erscheinen. Daten vor dem 7. Juli 2026 stammen aus dem
    früheren Gebiets-Crawl mit engeren Limits – die Objekt-Anzahlen springen am Umstellungstag
    sichtbar nach oben, die Mediane sind davon weitgehend unberührt.</p>`,
    },
    {
      id: 'objekte',
      titel: 'Objekte: die Zusammenführung der Inserate',
      inhalt: `
    <p><strong>Was ist das?</strong> Dieselbe Wohnung steht oft auf beiden Portalen – und
    taucht nach einer Pause manchmal als neues Inserat wieder auf. Damit sie in den Kennzahlen
    nur einmal zählt, fasst immo-radar Inserate heuristisch zu „Objekten" zusammen.</p>
    <p><strong>Regel „Duplikat"</strong> (zwei Inserate gleichzeitig online): nur
    <em>portal-übergreifend</em>; gleiche PLZ, Fläche ±${escapeHtml(String(FLAECHE_TOLERANZ_M2))} m²,
    exakt gleiche Zimmerzahl, Preisabstand höchstens ${kaufToleranz} % (Kauf) bzw.
    ${mieteToleranz} % oder ${MIETE_PREIS_TOLERANZ_EUR} € (Miete); ist bei beiden ein Baujahr
    angegeben, darf es höchstens ${BAUJAHR_TOLERANZ} Jahre auseinanderliegen. Zwei gleichzeitig
    aktive Inserate <em>desselben</em> Portals werden nie zusammengeführt – in Neubauprojekten
    sind baugleiche Wohnungen echte verschiedene Einheiten.</p>
    <p><strong>Regel „Wiedereinstellung"</strong> (zeitlich getrennt, Lücke bis
    ${RELISTING_MAX_LUECKE_TAGE} Tage): gleiche Attribut-Schwellen, Preis ±${relistingToleranz} % –
    die Preishistorie läuft weiter und die Vermarktungsdauer beginnt nicht von vorn.</p>
    <p><strong>Grenzen:</strong> Eine Heuristik kann irren – zwei sehr ähnliche Wohnungen im
    selben Haus können fälschlich verschmelzen, und ein Portal-Wechsel mit großem Preissprung
    bleibt getrennt. Jede Zuordnung ist mit Regel und Abweichungen protokolliert; nach
    Regeländerungen wird die gesamte Zuordnung deterministisch neu aufgebaut
    (<code>pnpm objekte:rebuild</code>). Die Roh-Inserate bleiben unangetastet und sind unter
    <a href="/inserate">Inserate</a> einsehbar.</p>`,
    },
    {
      id: 'aktive-inserate',
      titel: 'Aktiv und delistet',
      inhalt: `
    <p><strong>Was ist das?</strong> Aktiv = beim jüngsten Sweep des jeweiligen Portals noch
    gelistet. Ein <em>Objekt</em> ist aktiv, solange irgendeines seiner Inserate aktiv ist –
    delistet erst, wenn alle verschwunden sind. Delisting ist der Näherungswert für
    verkauft/vermietet.</p>
    <p><strong>Grenzen:</strong> „Aktiv" heißt nur: das Portal hat es noch gelistet. Delistete
    Inserate können auch zurückgezogen oder pausiert sein; taucht die Wohnung binnen
    ${RELISTING_MAX_LUECKE_TAGE} Tagen wieder auf, wird sie demselben Objekt zugeordnet.</p>`,
    },
    {
      id: 'eur-m2',
      titel: '€/m²',
      inhalt: `
    <p><strong>Was ist das?</strong> Der Preis pro Quadratmeter Wohnfläche – die Vergleichsgröße,
    die Wohnungen unterschiedlicher Größe vergleichbar macht.</p>
    <p><strong>Formel:</strong> Preis ÷ Wohnfläche. Bei Kauf der Kaufpreis, bei Miete die
    monatliche Kaltmiete. Ist ein Objekt auf beiden Portalen inseriert, zählt der
    <em>niedrigere</em> Preis – zu ihm würde transaktiert.</p>
    <p class="beispiel">Beispiel: 250.000 € ÷ 80 m² = 3.125 €/m² (Kauf) ·
    800 € ÷ 80 m² = 10 €/m² (Miete kalt).</p>
    <p><strong>Grenzen:</strong> Die Flächenangabe stammt aus dem Inserat und ist nicht
    verifiziert. Inserate ohne Flächenangabe fallen aus allen €/m²-Auswertungen heraus.</p>`,
    },
    {
      id: 'median-trend',
      titel: 'Die Zeitreihen (Median €/m², Rendite)',
      inhalt: `
    <p><strong>Was ist das?</strong> Die Marktentwicklung im Wochenraster: pro Stichtag der
    mittlere Quadratmeterpreis der damals aktiven Objekte, getrennt nach Kauf und Miete –
    plus die daraus abgeleitete <a href="#bruttorendite">Bruttorendite</a> als eigene Reihe.</p>
    <p><strong>Was ist ein Median?</strong> Der Wert in der Mitte, wenn man alle Werte der
    Größe nach sortiert – die Hälfte liegt darunter, die Hälfte darüber. Anders als der
    Durchschnitt verschiebt ihn ein einzelnes Luxus-Penthouse kaum; deshalb nutzt immo-radar
    fast überall den Median.</p>
    <p><strong>Formel:</strong> Wochenraster vom ersten Crawl bis zum letzten fertigen Sweep;
    pro Stichtag zählt ein Objekt, wenn es damals aktiv war, mit seinem damaligen Preis (aus
    der <a href="#preisaenderungen">Preishistorie</a> rekonstruiert). Der PLZ-/m²-Filter des
    Dashboards schränkt die Objektmenge ein, bevor gerechnet wird.</p>
    <p><strong>Grenzen:</strong> Bei engen Filtern hängt der Median an wenigen Objekten – die
    Anzahl pro Punkt steht im Diagramm-Tooltip. Sprünge können auch daher kommen, dass teure
    oder billige Objekte dazukommen bzw. verschwinden, nicht nur aus echten Preisänderungen.</p>`,
    },
    {
      id: 'preisaenderungen',
      titel: 'Preisänderungen',
      inhalt: `
    <p><strong>Was ist das?</strong> Wenn ein Anbieter den Preis eines laufenden Inserats
    ändert, zeichnet immo-radar das auf – für Käufer ist eine Senkung ein Signal
    (Verhandlungsspielraum, Preisdruck), deshalb ist sie grün markiert; Erhöhungen rot.</p>
    <p><strong>Formel:</strong> Beim täglichen Sweep wird der aktuelle Preis mit dem
    gespeicherten verglichen; jede Änderung wird mit Datum in der Preishistorie abgelegt
    (maximal ein Punkt pro Tag). Angezeigt wird die letzte Änderung: neuer Preis gegenüber
    dem vorherigen, in Prozent und Euro.</p>
    <p><strong>Grenzen:</strong> Änderungen zwischen zwei Sweeps (mehrfach am selben Tag)
    werden nur als eine gezählt – der letzte Preis des Tages gewinnt.</p>`,
    },
    {
      id: 'bruttorendite',
      titel: 'Bruttorendite',
      inhalt: `
    <p><strong>Was ist das?</strong> Das zentrale Anlage-Maß: Wie viel Jahres-Kaltmiete bringt
    ein investierter Kauf-Euro? Ab ${zielProzent} gilt das Ziel als erreicht und der Wert wird
    grün hervorgehoben.</p>
    <p><strong>Formel:</strong> (Median-Kaltmiete €/m² × 12) ÷ Median-Kaufpreis €/m², jeweils
    über die aktiven Objekte im gewählten Filter; als Zeitreihe je Wochen-Stichtag.</p>
    <p class="beispiel">Beispiel: 10 €/m² Kaltmiete × 12 = 120 €/m² Jahresmiete;
    120 ÷ 3.000 €/m² Kaufpreis = 4 %.</p>
    <p><strong>Grenzen:</strong> <em>Brutto</em> heißt: ohne Betriebskosten, Instandhaltung,
    Leerstand, Kaufnebenkosten und Steuern – die tatsächliche Netto-Rendite liegt darunter.
    Die Zahl vergleicht außerdem den Miet- mit dem Kauf-Markt, nicht dieselben Wohnungen.</p>`,
    },
    {
      id: 'portfolio-vergleich',
      titel: 'Portfolio: der Marktvergleich',
      inhalt: `
    <p><strong>Was ist das?</strong> Jedes eigene Objekt wird dem Markt gegenübergestellt:
    die eigene Kaltmiete/m² dem Markt-Median vergleichbarer Mietwohnungen, die eigene
    Ist-Rendite (Jahres-Kaltmiete ÷ Kaufpreis) der Markt-Bruttorendite. Liegt die eigene Miete
    unter Markt, wird das monatliche Potenzial ausgewiesen.</p>
    <p><strong>Formel:</strong> Verglichen wird zuerst innerhalb derselben PLZ; gibt es dort
    weniger als ${MIN_VERGLEICHSOBJEKTE} aktive Vergleichsobjekte, weitet sich der Vergleich
    auf den Bezirk, dann auf ganz Kärnten – die verwendete Ebene steht immer dabei, denn ein
    Kärnten-weiter Vergleich ist etwas anderes als einer in derselben Straße.</p>
    <p><strong>Grenzen:</strong> Der Markt-Median vergleicht Angebots-, keine Abschlusspreise;
    Ausstattung, Zustand und Lage innerhalb der PLZ bleiben unberücksichtigt. Das Potenzial
    ist eine Rechen-, keine Rechtsgröße (Mietrecht, Befristungen und Bestandsverträge setzen
    die realen Grenzen).</p>`,
    },
  ];
}

export function renderMethodikSeite(p: MethodikParameter): string {
  const sections = abschnitte(p)
    .map(
      (a) => `  <section class="methodik-abschnitt" id="${a.id}">
    <h2>${escapeHtml(a.titel)}</h2>${a.inhalt}
  </section>`,
    )
    .join('\n\n');

  const inhalt = `  <header>
    <h1>Methodik</h1>
    <p class="meta">Diese Seite erklärt jede Kennzahl von immo-radar – was sie bedeutet,
    wie sie berechnet wird und wo ihre Grenzen liegen. Sie ist bewusst auch ohne Finanz-
    oder Technik-Hintergrund lesbar.</p>
  </header>

${sections}

  <footer class="meta">
    <p>Median und Quartile werden mit linearer Interpolation berechnet (Methode „R-7",
    der Standard u. a. in Excel und R).</p>
  </footer>`;

  return seite('Methodik', inhalt, { extraCss: METHODIK_CSS });
}
