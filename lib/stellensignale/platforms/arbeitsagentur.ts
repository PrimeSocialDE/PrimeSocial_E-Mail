// ─────────────────────────────────────────────────────────────────
// DISCOVERY-Plattform: ARBEITSAGENTUR-Jobbörse — über die OFFIZIELLE API.
//
// Kein Apify mehr. Die Bundesagentur betreibt für ihre eigene Jobsuche eine
// öffentliche REST-Schnittstelle; die fragen wir direkt ab. Vorteile gegenüber
// dem alten Scraper-Weg:
//   • kostenlos, kein Actor, kein Token
//   • strukturierte Felder statt HTML-Raterei
//   • liefert das Veröffentlichungsdatum mit — "seit X Wochen offen" ergibt
//     sich damit sofort, statt erst über mehrere Crawl-Läufe zu entstehen
//
// Rücksicht auf einen fremden Dienst: kleine Seitengröße, harter Timeout,
// Deckel je Abfrage. Der Aufrufer (discover.ts) begrenzt zusätzlich die Anzahl
// der Ort×Gewerk-Kombinationen je Lauf.
// ─────────────────────────────────────────────────────────────────
import type { DiscoveryTreffer } from "@/types/stellensignale";

const BASIS = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs";
// Derselbe Schlüssel, den die öffentliche Jobsuche der Bundesagentur im Browser
// verwendet. Kein Geheimnis, keine Registrierung nötig.
const API_KEY = "jobboerse-jobsuche";
const TIMEOUT_MS = 15_000;

/**
 * Aktiv, sobald der Schalter gesetzt ist. Anders als früher braucht es keine
 * Actor-ID mehr — es entstehen ja keine Kosten.
 */
export function arbeitsagenturAktiv(): boolean {
  return process.env.STELLENSIGNALE_ARBEITSAGENTUR === "true";
}

interface BaStelle {
  titel?: string;
  beruf?: string;
  arbeitgeber?: string;
  refnr?: string;
  aktuelleVeroeffentlichungsdatum?: string;
  arbeitsort?: { ort?: string; plz?: string; region?: string };
}

interface BaAntwort {
  maxErgebnisse?: number;
  stellenangebote?: BaStelle[];
}

async function frage(params: Record<string, string>): Promise<BaAntwort | null> {
  const url = `${BASIS}?${new URLSearchParams(params).toString()}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "X-API-Key": API_KEY, Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as BaAntwort;
  } catch {
    return null;
  }
}

/** Detailseite der Anzeige, damit der Fund später nachvollziehbar bleibt. */
function anzeigenUrl(refnr: string | undefined): string | null {
  if (!refnr) return null;
  return `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`;
}

export async function discoverArbeitsagentur(ort: string, gewerk: string): Promise<DiscoveryTreffer[]> {
  if (!arbeitsagenturAktiv()) return [];

  const antwort = await frage({
    was: gewerk,
    wo: ort,
    umkreis: process.env.STELLENSIGNALE_BA_UMKREIS ?? "35",
    size: process.env.STELLENSIGNALE_BA_SIZE ?? "50",
    page: "1",
    angebotsart: "1", // 1 = Arbeitsstelle (keine Ausbildung, kein Praktikum)
  });
  if (!antwort?.stellenangebote?.length) return [];

  const treffer: DiscoveryTreffer[] = [];
  for (const s of antwort.stellenangebote) {
    const firma = (s.arbeitgeber ?? "").trim();
    const titel = (s.titel ?? s.beruf ?? "").trim();
    // Ohne Arbeitgebernamen ist der Treffer wertlos — wir wollen den Betrieb
    // anschreiben, nicht die Anzeige.
    if (!firma || !titel) continue;

    treffer.push({
      firma,
      ort: s.arbeitsort?.ort ?? ort,
      plz: s.arbeitsort?.plz ?? null,
      // Die BA liefert keine Firmen-Website. Die kommt später aus der
      // Maps-Anreicherung bzw. der Impressum-Suche.
      website: null,
      gewerk,
      mitarbeiter: null,
      stellentitel: titel,
      quelle: "arbeitsagentur",
      quelle_url: anzeigenUrl(s.refnr),
      // Kein Anzeigentext in der Trefferliste. Bewusst null statt Platzhalter:
      // istFachkraft() wertet dann nur den Titel aus, und der ist hier das
      // verlässlichere Signal.
      raw_text: null,
      // Inserent = Arbeitgeber. Genau darauf greift der Blacklist-Filter, der
      // Personaldienstleister aussortiert — und die stellen bei der BA einen
      // erheblichen Teil der Treffer.
      inserent: firma,
      bewerbung_email: null,
    });
  }
  return treffer;
}

/**
 * Wie viele offene Stellen gibt es zu einer Ort/Gewerk-Kombination insgesamt?
 * Damit lässt sich die Ziel-Matrix planen, ohne alle Treffer zu laden.
 */
export async function zaehleArbeitsagentur(ort: string, gewerk: string): Promise<number | null> {
  if (!arbeitsagenturAktiv()) return null;
  const antwort = await frage({
    was: gewerk,
    wo: ort,
    umkreis: process.env.STELLENSIGNALE_BA_UMKREIS ?? "35",
    size: "1",
    page: "1",
    angebotsart: "1",
  });
  return antwort?.maxErgebnisse ?? null;
}
