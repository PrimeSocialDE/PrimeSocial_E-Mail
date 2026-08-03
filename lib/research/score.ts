// ─────────────────────────────────────────────────────────────────
// SCORE (Stufe 1 — Suche) — leichtgewichtige Bewertung direkt nach der
// Google-Maps-Suche, NUR aus Maps-Daten (Name, Kategorie, Bewertungen).
// Liefert Größe/Branche/Score sofort in der Suche, OHNE teure Website-/
// E-Mail-/Instagram-Anreicherung (die passiert erst in der Leads-Stufe).
// Ein gebündelter Claude-Call pro Charge.
// ─────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
import { updateProspect } from "@/lib/research/db";
import { probeTeamSize, type TeamHint } from "@/lib/research/team-probe";
import type { ResearchProspect, EmployeeBucket } from "@/types/research";
import { EMPLOYEE_BUCKETS } from "@/types/research";

// Promise-Map mit Nebenläufigkeits-Limit (für die Team-Probes).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 5 });
  return _client;
}
function extractJson<T>(text: string): T {
  const json = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON zurückgegeben");
  return JSON.parse(json) as T;
}

// Deterministische Größen-Gewichtung (Ziel: ab 30 MA). Auch in qualify genutzt.
export function adjustScoreForSize(score: number, bucket: EmployeeBucket): number {
  let s = Math.max(0, Math.min(100, Math.round(score)));
  if (bucket === "100+") s = Math.min(100, s + 12);
  else if (bucket === "30-99") s = Math.min(100, s + 8);
  else if (bucket === "10-29") s = Math.max(0, s - 10);
  else if (bucket === "1-9") s = Math.max(0, s - 25);
  else if (bucket === "unknown") s = Math.max(0, s - 5);
  return s;
}

interface ScoreRow {
  i: number;
  sm_fit: boolean;
  employee_bucket: EmployeeBucket;
  branche_final: string;
  score: number;
  reasoning?: string;
}

const CHUNK = 20;

// Bewertet eine Charge Prospects aus Maps-Daten und schreibt das Ergebnis
// (Status 'scored' bzw. 'rejected'). Gibt die aktualisierten Prospects zurück.
// withTeamProbe=false überspringt den Website-Team-Check (für große, landesweite
// Läufe — schneller; Größe wird dann beim Anreichern in Leads verfeinert).
export async function scoreProspectsFromMaps(prospects: ResearchProspect[], withTeamProbe = true): Promise<ResearchProspect[]> {
  const updated: ResearchProspect[] = [];

  for (let off = 0; off < prospects.length; off += CHUNK) {
    const batch = prospects.slice(off, off + CHUNK);

    // Team-Probe: Team-/Über-uns-Seite je Firma kurz prüfen (zuverlässigerer
    // Größen-Indikator als die Bewertungsanzahl). Nebenläufig begrenzt.
    const hints: TeamHint[] = withTeamProbe
      ? await mapLimit(batch, 6, async (p) =>
          p.website ? await probeTeamSize(p.website).catch(() => ({ text: null, explicitCount: null })) : { text: null, explicitCount: null })
      : batch.map(() => ({ text: null, explicitCount: null }));

    const system = `Du bist Recherche-Analyst für PrimeSocial (Social-Media-Marketing-Agentur).
Du bewertest lokale Unternehmen als potenzielle Kunden anhand von Google-Maps-Daten UND – falls vorhanden – einem Auszug der Team-/Über-uns-Seite.

Pro Unternehmen:
- sm_fit (bool): Macht Social-Media-Betreuung Sinn? false bei Mitbewerbern (Marketing-/Werbe-/Webdesign-/Social-Media-Agenturen), reinen B2B-Nischen ohne Endkunden, Behörden.
- employee_bucket: Mitarbeiterzahl schätzen. PRIORITÄT der Signale:
  1) "mitarbeiter_explizit" (explizit genannte Zahl auf der Website) → wenn vorhanden, daraus den Bucket ableiten.
  2) "team_auszug" → Personen/Teammitglieder grob zählen bzw. Größe ableiten.
  3) erst zuletzt Kategorie + Bewertungsanzahl als grober Proxy.
  Werte: "1-9","10-29","30-99","100+","unknown". Lieber "unknown" als wild raten.
- branche_final: knappe, klare Branchenbezeichnung.
- score (0–100): PrimeSocial will vor allem GROSSE Unternehmen (ab 30 MA). Größe stark gewichten; klarer B2C-Fit erhöht.

Antworte AUSSCHLIESSLICH mit einem JSON-Array, ein Objekt pro Unternehmen, mit demselben Index "i".`;

    const list = batch.map((p, idx) => ({
      i: idx,
      name: p.company_name,
      kategorie: p.gmaps_category ?? "?",
      ort: [p.city, p.bundesland].filter(Boolean).join(", "),
      bewertung: p.rating ?? null,
      bewertungen: p.reviews_count ?? 0,
      mitarbeiter_explizit: hints[idx]?.explicitCount ?? null,
      team_auszug: hints[idx]?.text ?? null,
    }));

    const userPrompt = `Bewerte diese ${batch.length} Unternehmen:
${JSON.stringify(list, null, 2)}

Antworte NUR als JSON-Array:
[{"i":0,"sm_fit":true,"employee_bucket":"30-99","branche_final":"Dachdeckerei","score":74}]`;

    let rows: ScoreRow[] = [];
    try {
      const msg = await client().messages.create({
        model: MODEL, max_tokens: 2000, system,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      rows = extractJson<ScoreRow[]>(text);
    } catch (e) {
      console.error("[research/score] Scoring-Charge fehlgeschlagen:", e);
      // Fallback: Prospects bleiben 'discovered' mit Notiz — können später erneut.
      for (const p of batch) updated.push(await updateProspect(p.id, { reject_reason: `Scoring-Fehler: ${String(e instanceof Error ? e.message : e)}` }));
      continue;
    }

    const byIndex = new Map(rows.map((r) => [r.i, r]));
    for (let idx = 0; idx < batch.length; idx++) {
      const p = batch[idx];
      const r = byIndex.get(idx);
      if (!r) { updated.push(p); continue; }
      const bucket: EmployeeBucket = EMPLOYEE_BUCKETS.includes(r.employee_bucket) ? r.employee_bucket : "unknown";
      const score = adjustScoreForSize(r.score ?? 0, bucket);
      const u = await updateProspect(p.id, {
        status: r.sm_fit ? "scored" : "rejected",
        sm_fit: !!r.sm_fit,
        employee_bucket: bucket,
        branche_final: r.branche_final ?? p.gmaps_category ?? null,
        score,
        reject_reason: r.sm_fit ? null : `Kein SM-Fit: ${r.reasoning ?? ""}`.trim(),
      });
      updated.push(u);
    }
  }

  return updated;
}
