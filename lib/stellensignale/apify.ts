// ─────────────────────────────────────────────────────────────────
// SICHERER APIFY-WRAPPER für das Stellensignal-Modul.
//
// Mehrere Kostenschutz-Schichten (die eigentliche Sorge: durchdrehender
// Actor / Endlos-Retries → dicke Vercel/Apify-Rechnung):
//   1. Kein Token / keine Actor-ID  → gar kein Call (return []).
//   2. maxItems      → Pay-per-Result-Deckel je Query.
//   3. timeout (Sek) → Apify beendet den Run HART danach → Laufzeit-Deckel.
//   4. waitSecs      → wir warten nie länger als der Run.
//   5. try/catch     → wirft NIE nach oben. Ein Fehler = leere Liste, der
//      Cron läuft stabil weiter (keine Crash-Retry-Schleife, die Geld frisst).
// ─────────────────────────────────────────────────────────────────
import "proxy-agent"; // Side-Effect-Import — siehe lib/apify.ts (Bundler-Fix)
import { ApifyClient } from "apify-client";
import type { DiscoveryTreffer, SignalQuelle } from "@/types/stellensignale";

let _client: ApifyClient | null = null;
function client(): ApifyClient {
  if (!_client) _client = new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
  return _client;
}

export function apifyKonfiguriert(): boolean {
  return !!process.env.APIFY_API_TOKEN;
}

// Kosten-Deckel aus Env, mit bewusst NIEDRIGEN Defaults.
export function limits() {
  return {
    maxItems: parseInt(process.env.STELLENSIGNALE_MAX_ITEMS ?? "25", 10),   // je Query
    timeoutSecs: parseInt(process.env.STELLENSIGNALE_ACTOR_TIMEOUT ?? "90", 10),
  };
}

// Ein Actor-Aufruf, hart gedeckelt. actorId leer / kein Token → kein Call.
export async function callActorSafe(
  actorId: string | undefined,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  if (!actorId || !apifyKonfiguriert()) return [];
  const { maxItems, timeoutSecs } = limits();
  try {
    const run = await client()
      .actor(actorId)
      .call(input, {
        timeout: timeoutSecs,        // Run-Hardkill → Laufzeit-Kostendeckel
        waitSecs: timeoutSecs + 15,  // wir warten nicht länger als der Run
        maxItems,                    // Pay-per-Result-Deckel
        memory: 1024,
      });
    if (!run?.defaultDatasetId) return [];
    const { items } = await client().dataset(run.defaultDatasetId).listItems({ limit: maxItems });
    return (items ?? []) as Record<string, unknown>[];
  } catch (e) {
    // NIE werfen: sonst crasht der Cron und Vercel retried → Kostenrisiko.
    console.error(`[stellensignale] Apify-Actor "${actorId}" Fehler:`, e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Feld-Zugriff robust (Actor-Outputs variieren je Anbieter) ──────
function str(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/;

// Mitarbeiterzahl aus verschiedenen Formaten schätzen:
// "51 to 200" -> 200 | "10 bis 49" -> 49 | "1.000+" -> 1000 | 85 -> 85
// Genommen wird die größte gefundene Zahl (Obergrenze der Spanne).
function parseMitarbeiter(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== "string") return null;
  const nums = v.replace(/[.\s]/g, "").match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const max = Math.max(...nums.map(Number));
  return Number.isFinite(max) && max > 0 ? max : null;
}

// Ein rohes Actor-Item → DiscoveryTreffer. Defensive Feld-Fallbacks; sobald wir
// das echte Actor-Output-Schema sehen, hier ggf. Feldnamen nachziehen.
// Gibt null zurück, wenn keine Firma erkennbar ist (dann wertlos).
export function toTreffer(
  item: Record<string, unknown>,
  ctx: { quelle: SignalQuelle; gewerk: string; fallbackOrt: string }
): DiscoveryTreffer | null {
  const firma = str(item, ["company", "companyName", "employer", "employerName", "inserent", "advertiser"]);
  if (!firma) return null;

  const stellentitel = str(item, ["title", "positionName", "jobTitle", "position", "name"]) ?? "Stellenanzeige";
  const rawText = str(item, ["description", "descriptionText", "descriptionHTML", "snippet", "jobDescription", "text"]);
  const emailImText = rawText ? rawText.match(EMAIL_RE)?.[0] ?? null : null;

  // Firmen-Website NICHT aus der Job-URL ableiten (das wäre indeed.com o.ä.).
  // Nur echte Website-Felder — bei misceres liegt sie in companyInfo.url
  // (nur mit parseCompanyDetails=true vorhanden).
  const companyInfo = (item.companyInfo ?? {}) as Record<string, unknown>;
  const website = str(item, ["companyWebsite", "website", "companyUrl"]) ?? str(companyInfo, ["url", "website"]);

  // Mitarbeiterzahl (nur mit Firmendetails vorhanden) — Feldnamen variieren.
  const mitarbeiter =
    parseMitarbeiter(companyInfo.employeeCount) ??
    parseMitarbeiter(companyInfo.employees) ??
    parseMitarbeiter(companyInfo.size) ??
    parseMitarbeiter(companyInfo.companySize) ??
    parseMitarbeiter(item.employeeCount) ??
    parseMitarbeiter(item.companySize);

  return {
    firma,
    ort: str(item, ["location", "city", "ort", "place"]) ?? ctx.fallbackOrt,
    plz: str(item, ["postalCode", "plz", "zip"]),
    website,
    gewerk: ctx.gewerk,
    mitarbeiter,
    stellentitel,
    quelle: ctx.quelle,
    quelle_url: str(item, ["url", "jobUrl", "link", "externalApplyLink", "adUrl", "externalUrl"]),
    raw_text: rawText,
    inserent: str(item, ["inserent", "advertiser", "companyName", "employer"]) ?? firma,
    bewerbung_email: str(item, ["applyEmail", "email", "contactEmail"]) ?? emailImText,
  };
}
