// ─────────────────────────────────────────────────────────────────
// EMAIL-FINDER — günstig zuerst, teuer nur im Notfall.
//
// Reihenfolge (kostenoptimiert):
//   1. GF-Mail steht direkt auf der Website (Impressum/Team) → quelle "impressum"
//   2. Schema aus anderen Mails ableiten + GF-Mail konstruieren → quelle "pattern"
//   3. Generische Info-Mail als Rückfall                         → quelle "impressum"
//   4. Hunter                                                    → NUR Flag + Cap
//
// Schritte 1–3 sind reine HTTP-Fetches (kostenlos) über den bestehenden
// scrapeWebsiteForContact. Läuft nur, wenn das Modul (Cron) aktiviert ist.
// ─────────────────────────────────────────────────────────────────
import { scrapeWebsiteForContact } from "@/lib/website-scraper";
import { inferGfEmail, parseName } from "@/lib/stellensignale/email-pattern";
import { domainOf } from "@/lib/stellensignale/filter";
import { getFirmenOhneEmail, updateZielfirma } from "@/lib/stellensignale/db";
import { ordneEin } from "@/lib/stellensignale/branche";
import type { Zielfirma, EmailFund } from "@/types/stellensignale";

const GENERIC_PREFIX = /^(info|hallo|kontakt|contact|service|office|team|post|mail|email|anfrage|karriere|jobs?|bewerbung)\b/;

// Lokalteil normalisieren, aber Trennzeichen behalten (für exakten Schema-Vergleich).
function normLocal(local: string): string {
  return local
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z._-]/g, "");
}

// Steht die GF-Mail wörtlich auf der Seite? Exakter Abgleich der gängigen
// Schemata gegen die gefundenen Lokalteile (präziser als loses "includes").
function findeGfMailDirekt(emails: string[], gfName: string | null, domain: string): string | null {
  const n = parseName(gfName);
  if (!n) return null;
  const templates = ["{first}.{last}", "{f}.{last}", "{first}-{last}", "{first}_{last}", "{first}{last}", "{f}{last}", "{last}.{first}"];
  const kandidaten = new Set(
    templates.map((t) =>
      t.replace("{first}", n.first).replace("{last}", n.last).replace("{f}", n.first[0]).replace("{l}", n.last[0])
    )
  );
  for (const e of emails) {
    const [local, dom] = e.toLowerCase().split("@");
    if (!dom || dom.replace(/^www\./, "") !== domain.replace(/^www\./, "")) continue;
    if (kandidaten.has(normLocal(local))) return `${normLocal(local)}@${domain}`;
  }
  return null;
}

// Hunter ist teuer → nur wenn explizit freigeschaltet.
export function hunterAktiviert(): boolean {
  return process.env.STELLENSIGNALE_HUNTER === "true";
}

// E-Mail (+ ggf. GF-Name) für eine Firma ermitteln. null, wenn nichts gefunden.
export async function findeFirmenEmail(firma: Zielfirma): Promise<EmailFund | null> {
  if (!firma.website) return null;
  const domain = domainOf(firma.website);
  if (!domain) return null;

  const scrape = await scrapeWebsiteForContact(firma.website);
  const gfName = firma.gf_name ?? scrape.gfName;

  // 1) GF-Mail direkt auf der Seite gefunden → verlässlichste Quelle.
  const direkt = findeGfMailDirekt(scrape.emails, gfName, domain);
  if (direkt) {
    return { email: direkt, quelle: "impressum", gf_name: gfName, confidence: 90 };
  }

  // 2) Schema ableiten + GF-Mail konstruieren (die "smarte" Vermutung).
  const inferred = inferGfEmail({ emails: scrape.emails, gfName, domain });
  if (inferred) {
    return { email: inferred.email, quelle: "pattern", gf_name: gfName, confidence: inferred.confidence };
  }

  // 3) Rückfall: irgendeine nicht-generische Mail, sonst die Info-Mail.
  const persoenlich = scrape.emails.find((e) => !GENERIC_PREFIX.test(e.split("@")[0].toLowerCase()));
  const rueckfall = persoenlich ?? scrape.bestEmail ?? scrape.emails[0];
  if (rueckfall) {
    return { email: rueckfall.toLowerCase(), quelle: "impressum", gf_name: gfName, confidence: persoenlich ? 55 : 35 };
  }

  // 4) Hunter — nur wenn freigeschaltet (teuer). Bewusst hier als letzter Schritt.
  //    (Wiring folgt in Phase 2 mit hartem Budget-Cap; aktuell kein Call.)
  //    if (hunterAktiviert()) { … lib/hunter.findEmail … }
  return null;
}

export interface EnrichmentResult {
  kandidaten: number; // Firmen mit Website ohne Mail (gesamt)
  geprueft: number;
  gefunden: number;
  perPattern: number;
  proben: { firma: string; website: string | null; ergebnis: string }[]; // pro Firma, zur Diagnose
  fehler: string[];
}

// Enrichment-Lauf: Firmen (mit Website) ohne Mail durchgehen, Mail ermitteln,
// speichern. Liefert pro Firma ein Diagnose-Ergebnis zurück.
export async function runEmailEnrichment(opts?: { limit?: number }): Promise<EnrichmentResult> {
  const result: EnrichmentResult = { kandidaten: 0, geprueft: 0, gefunden: 0, perPattern: 0, proben: [], fehler: [] };
  const limit = opts?.limit ?? parseInt(process.env.STELLENSIGNALE_EMAIL_LIMIT ?? "120", 10);

  const alle = await getFirmenOhneEmail(); // alle Kandidaten (mit Website, ohne Mail)

  // VORFILTER: nicht jede Firma durch den teuren Impressum-Scraper schicken.
  // OSM liefert alles, was in einer Region existiert — auch Fotostudios und
  // Galerien. Ungefiltert lag die Trefferquote bei 4 %, weil der Scraper seine
  // Zeit bei Betrieben verbrachte, die ohnehin nie angeschrieben werden.
  // Reihenfolge: klare Ziele zuerst, "vielleicht" nur mit Restkapazitaet,
  // "raus" gar nicht.
  const bewertet = alle
    .map((f) => ({ f, u: ordneEin(f.firma, f.gewerk) }))
    .filter((x) => x.u.relevanz !== "raus")
    .sort((a, b) => (a.u.relevanz === "ziel" ? 0 : 1) - (b.u.relevanz === "ziel" ? 0 : 1));

  result.kandidaten = bewertet.length;
  const batch = bewertet.slice(0, limit).map((x) => x.f);

  for (const firma of batch) {
    result.geprueft++;
    try {
      const fund = await findeFirmenEmail(firma);
      result.proben.push({
        firma: firma.firma,
        website: firma.website,
        ergebnis: fund ? `${fund.email} (${fund.quelle}, ${fund.confidence}%)` : "keine Mail gefunden",
      });
      if (!fund) {
        // Erfolglosen Versuch markieren, indem updated_at angefasst wird.
        // Ohne das rutscht die Firma beim naechsten Lauf wieder an den Anfang
        // der Warteschlange und blockiert dauerhaft einen Platz — genau so
        // wurden zehn Runden lang immer dieselben 25 Firmen geprueft, waehrend
        // 646 neue mit Website nie an die Reihe kamen.
        await updateZielfirma(firma.id, { updated_at: new Date().toISOString() });
        continue;
      }
      await updateZielfirma(firma.id, {
        email: fund.email,
        gf_name: firma.gf_name ?? fund.gf_name,
        email_quelle: fund.quelle,
        email_confidence: fund.confidence,
      });
      result.gefunden++;
      if (fund.quelle === "pattern") result.perPattern++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.proben.push({ firma: firma.firma, website: firma.website, ergebnis: `FEHLER: ${msg}` });
      result.fehler.push(`${firma.firma}: ${msg}`);
    }
  }
  return result;
}
