// ─────────────────────────────────────────────────────────────────
// QUALIFY — aus angereichertem Prospect ein Dossier machen (Claude).
// Output: SM-Fit, Mitarbeiter-Bucket (Schätzung), Instagram-Schwächen,
// Aufhänger, Score 0–100. Große Unternehmen (ab 30 MA) werden bevorzugt.
// Instagram wird nur einbezogen, wenn es (auf Anfrage) gescraped wurde.
// ─────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
import { updateProspect } from "@/lib/research/db";
import type {
  ResearchProspect, IgWeakness, EmployeeBucket,
} from "@/types/research";
import { EMPLOYEE_BUCKETS } from "@/types/research";
import { adjustScoreForSize } from "@/lib/research/score";
import type { InstagramData, InstagramPost } from "@/types";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  // maxRetries fängt transiente 429/5xx/529-„Overloaded" der Anthropic-API ab.
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 5 });
  return _client;
}
function extractJson<T>(text: string): T {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON zurückgegeben");
  return JSON.parse(json) as T;
}

// Instagram-Snapshot für Claude. igChecked=false → noch nicht geprüft (NICHT als
// „kein Account" werten). igChecked=true + null → wirklich kein Account gefunden.
function igSnapshot(ig: InstagramData | null | undefined, igChecked: boolean): string {
  if (!igChecked) return "Instagram wurde noch NICHT geprüft (separat auf Anfrage). Generiere KEINE Instagram-bezogenen Schwächen und beziehe den Aufhänger NICHT auf Instagram.";
  if (!ig) return "Instagram wurde geprüft: KEIN Account auffindbar.";
  const posts: InstagramPost[] = ig.latestPosts ?? [];
  const now = Date.now();
  const lastTs = posts[0]?.timestamp ? new Date(posts[0].timestamp).getTime() : null;
  const daysSinceLast = lastTs ? Math.round((now - lastTs) / 86_400_000) : null;
  const videoCount = posts.filter((p) => (p.type ?? "").toLowerCase().includes("video")).length;

  let freqNote = "unbekannt";
  if (posts.length >= 2) {
    const oldest = posts[posts.length - 1]?.timestamp ? new Date(posts[posts.length - 1].timestamp!).getTime() : null;
    if (lastTs && oldest && lastTs > oldest) {
      const spanDays = (lastTs - oldest) / 86_400_000;
      const perMonth = (posts.length / spanDays) * 30;
      freqNote = `${perMonth.toFixed(1)} Posts/Monat (auf Basis der letzten ${posts.length})`;
    }
  }

  return [
    `Handle: @${ig.username ?? "?"}`,
    `Follower: ${ig.followersCount ?? "?"}`,
    `Posts gesamt: ${ig.postsCount ?? "?"}`,
    `Bio: ${ig.biography ? JSON.stringify(ig.biography.slice(0, 200)) : "(leer)"}`,
    `Externer Link in Bio: ${ig.externalUrl ? "ja" : "nein"}`,
    `Letzter Post vor: ${daysSinceLast === null ? "unbekannt" : `${daysSinceLast} Tagen`}`,
    `Videos/Reels unter den letzten ${posts.length} Posts: ${videoCount}`,
    `Posting-Frequenz: ${freqNote}`,
  ].join("\n");
}

export interface QualifyOutput {
  sm_fit: boolean;
  employee_bucket: EmployeeBucket;
  branche_final: string;
  ig_weaknesses: IgWeakness[];
  hook: string;
  score: number;
  reasoning: string;
}

export async function qualifyProspect(
  prospect: ResearchProspect,
  igData: InstagramData | null | undefined,
  igChecked = false,
): Promise<ResearchProspect> {
  const system = `Du bist Recherche-Analyst für PrimeSocial, eine Social-Media-Marketing-Agentur.
Du bewertest ein Unternehmen als potenziellen Kunden für Social-Media-Betreuung (Content, Reels, Recruiting, Branding).

Deine Aufgabe pro Unternehmen:
1. SM-FIT: Macht professionelle Social-Media-Betreuung Sinn? (true/false)
   - true bei B2C/Dienstleistungs-Unternehmen mit sichtbarem Publikum (Praxen, Handwerk, Handel, Gesundheit, Beauty, Fitness, Immobilien, Bau, …).
   - false bei: reinen B2B-Nischendienstleistern ohne Endkunden-Bezug, Mitbewerbern (Marketing-/Werbe-/Social-Media-/Webdesign-Agenturen), Behörden.
2. EMPLOYEE_BUCKET: Schätze die Mitarbeiterzahl aus Website-Signalen (Team-/Über-uns-Seite, Standorte, Umfang, Bewertungsanzahl als grober Proxy). Erlaubte Werte: "1-9", "10-29", "30-99", "100+", "unknown". Lieber "unknown" als wild raten.
3. IG_WEAKNESSES: Schwächen des Instagram-Auftritts als Liste (code + label) — NUR wenn Instagram-Daten vorliegen. Liegt kein Instagram-Snapshot vor, gib eine LEERE Liste zurück.
4. HOOK: EIN konkreter, lockerer Aufhänger-Satz auf Deutsch für eine Cold-Mail. Auf Augenhöhe, kein Marketing-Sprech, keine Superlative. Liegen Instagram-Daten vor, greife die wichtigste Schwäche auf; sonst beziehe dich auf Website/Unternehmen.
5. SCORE: 0–100. WICHTIG: PrimeSocial will vor allem GROSSE Unternehmen (ab 30 Mitarbeitern). Gewichte die Unternehmensgröße stark:
   - "30-99" und "100+" → hoher Score (klare Zielgröße).
   - "10-29" → mittel, eher niedriger.
   - "1-9" → niedrig (zu klein).
   Zusätzlich: klarer SM-Fit und behebbare Schwächen erhöhen den Score.

Antworte AUSSCHLIESSLICH mit validem JSON, kein Text davor/danach.`;

  const userPrompt = `UNTERNEHMEN
Name: ${prospect.company_name}
Branche (Google Maps): ${prospect.gmaps_category ?? "?"}
Ort: ${[prospect.city, prospect.bundesland].filter(Boolean).join(", ") || "?"}
Website: ${prospect.website ?? "?"}
Google-Bewertung: ${prospect.rating ?? "?"} (${prospect.reviews_count ?? 0} Bewertungen)
Geschäftsführer/Entscheider: ${prospect.gf_name ?? "unbekannt"}
Website-Zusammenfassung: ${prospect.website_summary ?? "(keine)"}

INSTAGRAM
${igSnapshot(igData, igChecked)}

Antworte NUR im JSON-Format:
{
  "sm_fit": true,
  "employee_bucket": "30-99",
  "branche_final": "z.B. Dachdeckerei",
  "ig_weaknesses": [],
  "hook": "Ein konkreter Aufhänger-Satz …",
  "score": 72,
  "reasoning": "1 kurzer Satz zur Begründung"
}`;

  let out: QualifyOutput;
  try {
    const msg = await client().messages.create({
      model: MODEL, max_tokens: 1200, system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    out = extractJson<QualifyOutput>(text);
  } catch (e) {
    return updateProspect(prospect.id, { reject_reason: `Qualify-Fehler: ${String(e instanceof Error ? e.message : e)}` });
  }

  const bucket: EmployeeBucket = EMPLOYEE_BUCKETS.includes(out.employee_bucket) ? out.employee_bucket : "unknown";
  const weaknesses = Array.isArray(out.ig_weaknesses) ? out.ig_weaknesses : [];
  let score = adjustScoreForSize(out.score ?? 0, bucket);

  // Bounce-Gate: nicht zustellbare E-Mail → raus aus der Queue.
  const undeliverable = prospect.email_verify_status === "undeliverable";
  if (prospect.email_verify_status === "risky") score = Math.round(score * 0.8);

  const rejected = !out.sm_fit || undeliverable;
  const rejectReason = !out.sm_fit
    ? `Kein SM-Fit: ${out.reasoning ?? ""}`.trim()
    : undeliverable
      ? "E-Mail laut Hunter nicht zustellbar"
      : null;

  return updateProspect(prospect.id, {
    status: rejected ? "rejected" : "qualified",
    sm_fit: !!out.sm_fit,
    employee_bucket: bucket,
    branche_final: out.branche_final ?? prospect.gmaps_category ?? null,
    // IG-Schwächen nur überschreiben, wenn IG geprüft wurde (sonst bestehende behalten)
    ...(igChecked ? { ig_weaknesses: weaknesses } : {}),
    hook: out.hook ?? prospect.hook ?? null,
    score,
    reject_reason: rejectReason,
  });
}
