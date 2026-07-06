import { fmtRendite } from './format.js';
import { escapeHtml, seite } from './layout.js';

/**
 * Zentrale Erklärseite aller Kennzahlen: was sie bedeuten, wie sie berechnet
 * werden, wo ihre Grenzen liegen. Die Auswertungsseiten verlinken per Anker
 * hierher (#aktive-inserate, #delistet, …) – die Anker-IDs sind deshalb
 * Vertrag, nicht Deko. Bewusst ohne Navbar-Markierung (Referenz, kein
 * Arbeitsfluss) und in Schmalbreite (Prosa).
 */

export interface MethodikParameter {
  /** Fenster der „Kürzlich delistet"-Tabelle in Tagen (Server-Konstante). */
  delistetFensterTage: number;
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
  return [
    {
      id: 'datenbasis',
      titel: 'Datenbasis: der Inseratsbestand',
      inhalt: `
    <p><strong>Was ist das?</strong> Alle Zahlen stammen aus dem historisierten Inseratsbestand:
    Jedes aktive Beobachtungsgebiet wird einmal täglich auf willhaben.at und immoscout24.at
    gecrawlt. Jedes gefundene Inserat bekommt eine Zeile im Bestand, die über die Zeit
    fortgeschrieben wird – wann es zuerst und zuletzt gesehen wurde und wie sich sein Preis
    entwickelt hat.</p>
    <p><strong>Grenzen:</strong> Die Portale liefern pro Abfrage höchstens ≈150 (willhaben)
    bzw. ≈75 (immoscout24) Inserate – große Gebiete sind daher eine Stichprobe, keine
    Vollerhebung. Dasselbe Objekt kann auf beiden Portalen stehen und zählt dann doppelt
    (keine portal-übergreifende Zusammenführung). Und weil nur einmal täglich gecrawlt wird,
    bleibt ein Inserat, das am selben Tag erscheint und wieder verschwindet, unsichtbar.
    Rückblickende Tages-Auswertungen (Crawl-Läufe) werden aus dem heutigen Bestand
    rekonstruiert: Taucht ein verschwundenes Inserat später wieder auf, verschwindet es
    nachträglich aus der Delistet-Liste des alten Laufs.</p>`,
    },
    {
      id: 'aktive-inserate',
      titel: 'Aktive Inserate',
      inhalt: `
    <p><strong>Was ist das?</strong> Die Inserate, die beim letzten erfolgreichen Crawl-Lauf
    noch online waren – der aktuelle Marktbestand des Gebiets.</p>
    <p><strong>Formel:</strong> zuletzt gesehen am Stichtag (= Datum des letzten erfolgreichen
    Laufs) oder später.</p>
    <p><strong>Grenzen:</strong> „Aktiv" heißt nur: das Portal hat es noch gelistet. Ob es
    real noch verfügbar ist, weiß nur der Anbieter.</p>`,
    },
    {
      id: 'delistet',
      titel: 'Delistet',
      inhalt: `
    <p><strong>Was ist das?</strong> Inserate, die in einem früheren Crawl gesehen wurden,
    beim letzten aber nicht mehr – sie sind vom Portal verschwunden.</p>
    <p><strong>Formel:</strong> zuletzt gesehen vor dem Stichtag des letzten erfolgreichen
    Laufs. Die Tabelle „Kürzlich delistet" zeigt das Fenster der letzten
    ${p.delistetFensterTage} Tage.</p>
    <p><strong>Grenzen:</strong> Delisting ist ein <em>Näherungswert</em> für
    verkauft/vermietet – Inserate können auch zurückgezogen, pausiert oder neu eingestellt
    worden sein. Auch ein Inserat, das per Preisänderung aus dem Preisfenster des Gebiets
    fällt, gilt aus Sicht des Gebiets als delistet.</p>`,
    },
    {
      id: 'vermarktungsdauer',
      titel: 'Vermarktungsdauer',
      inhalt: `
    <p><strong>Was ist das?</strong> Wie lange delistete Inserate online waren, bevor sie
    verschwanden – ein Anhaltspunkt, wie schnell der Markt in diesem Gebiet dreht.</p>
    <p><strong>Formel:</strong> zuletzt gesehen − zuerst gesehen, in Tagen; angegeben wird
    der <a href="#median-trend">Median</a> (und zum Vergleich der Durchschnitt Ø), getrennt
    nach Kauf und Miete.</p>
    <p><strong>Grenzen:</strong> Inserate, die schon beim allerersten Crawl des Gebiets
    online waren, könnten davor bereits wochenlang gelistet gewesen sein – ihre gemessene
    Dauer ist eine Untergrenze. Die Kennzahl wird verlässlicher, je länger das Gebiet
    beobachtet wird.</p>`,
    },
    {
      id: 'eur-m2',
      titel: '€/m²',
      inhalt: `
    <p><strong>Was ist das?</strong> Der Preis pro Quadratmeter Wohnfläche – die Vergleichsgröße,
    die Wohnungen unterschiedlicher Größe vergleichbar macht.</p>
    <p><strong>Formel:</strong> Preis ÷ Wohnfläche. Bei Kauf der Kaufpreis, bei Miete die
    monatliche Kaltmiete.</p>
    <p class="beispiel">Beispiel: 250.000 € ÷ 80 m² = 3.125 €/m² (Kauf) ·
    800 € ÷ 80 m² = 10 €/m² (Miete kalt).</p>
    <p><strong>Grenzen:</strong> Die Flächenangabe stammt aus dem Inserat und ist nicht
    verifiziert. Inserate ohne Flächenangabe fallen aus allen €/m²-Auswertungen heraus.</p>`,
    },
    {
      id: 'median-trend',
      titel: 'Median €/m² über die Zeit',
      inhalt: `
    <p><strong>Was ist das?</strong> Die Preisentwicklung des Gebiets: pro Woche der mittlere
    Quadratmeterpreis der damals aktiven Inserate, getrennt nach Kauf und Miete.</p>
    <p><strong>Was ist ein Median?</strong> Der Wert in der Mitte, wenn man alle Werte der
    Größe nach sortiert – die Hälfte liegt darunter, die Hälfte darüber. Anders als der
    Durchschnitt verschiebt ihn ein einzelnes Luxus-Penthouse kaum; deshalb nutzt immo-radar
    fast überall den Median.</p>
    <p><strong>Formel:</strong> Wochenraster vom ersten Crawl bis heute; pro Stichtag zählt
    ein Inserat, wenn es damals aktiv war, mit seinem damaligen Preis (aus der
    <a href="#preisaenderungen">Preishistorie</a> rekonstruiert).</p>
    <p><strong>Grenzen:</strong> In kleinen Gebieten hängt der Median an wenigen Inseraten –
    die Anzahl pro Punkt steht im Diagramm-Tooltip. Sprünge können auch daher kommen, dass
    teure oder billige Inserate dazukommen bzw. verschwinden, nicht nur aus echten
    Preisänderungen.</p>`,
    },
    {
      id: 'preisaenderungen',
      titel: 'Preisänderungen',
      inhalt: `
    <p><strong>Was ist das?</strong> Wenn ein Anbieter den Preis eines laufenden Inserats
    ändert, zeichnet immo-radar das auf – für Käufer ist eine Senkung ein Signal
    (Verhandlungsspielraum, Preisdruck), deshalb ist sie grün markiert; Erhöhungen rot.</p>
    <p><strong>Formel:</strong> Beim täglichen Crawl wird der aktuelle Preis mit dem
    gespeicherten verglichen; jede Änderung wird mit Datum in der Preishistorie abgelegt
    (maximal ein Punkt pro Tag). Angezeigt wird die letzte Änderung: neuer Preis gegenüber
    dem vorherigen, in Prozent und Euro.</p>
    <p><strong>Grenzen:</strong> Änderungen zwischen zwei Crawls (mehrfach am selben Tag)
    werden nur als eine gezählt – der letzte Preis des Tages gewinnt.</p>`,
    },
    {
      id: 'bruttorendite',
      titel: 'Bruttorendite',
      inhalt: `
    <p><strong>Was ist das?</strong> Das zentrale Anlage-Maß: Wie viel Jahres-Kaltmiete bringt
    ein investierter Kauf-Euro in diesem Gebiet? Ab ${zielProzent} gilt das Ziel als erreicht
    und der Wert wird grün hervorgehoben.</p>
    <p><strong>Formel:</strong> (Median-Kaltmiete €/m² × 12) ÷ Median-Kaufpreis €/m², jeweils
    über die aktiven Inserate des Gebiets.</p>
    <p class="beispiel">Beispiel: 10 €/m² Kaltmiete × 12 = 120 €/m² Jahresmiete;
    120 ÷ 3.000 €/m² Kaufpreis = 4 %.</p>
    <p><strong>Grenzen:</strong> <em>Brutto</em> heißt: ohne Betriebskosten, Instandhaltung,
    Leerstand, Kaufnebenkosten und Steuern – die tatsächliche Netto-Rendite liegt darunter.
    Die Zahl ist eine Obergrenze zum Vergleichen von Gebieten, keine Ertragsprognose. Sie
    vergleicht außerdem den Miet- und den Kauf-Markt desselben Gebiets, nicht dieselben
    Wohnungen.</p>`,
    },
    {
      id: 'ausreisser',
      titel: 'Ausreißer',
      inhalt: `
    <p><strong>Was ist das?</strong> Inserate, deren €/m² weit außerhalb des üblichen Bereichs
    ihres Gebiets liegt – im Marktreport rot markiert, damit sie den Vergleich nicht
    verzerren und man sie sich gezielt ansehen kann (Tippfehler? Sanierungsfall?
    Luxusobjekt?).</p>
    <p><strong>Formel:</strong> die übliche 1,5×IQR-Regel: Man nimmt das Viertel der
    günstigsten und das Viertel der teuersten Werte; wer mehr als das 1,5-Fache des Abstands
    zwischen diesen Vierteln darunter oder darüber liegt, gilt als Ausreißer. Bewertet je
    Gebiet und Typ, erst ab 4 Inseraten.</p>
    <p><strong>Grenzen:</strong> Ein Ausreißer ist auffällig, nicht falsch – die Markierung
    ist eine Einladung zum Nachsehen, kein Urteil über das Objekt.</p>`,
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
