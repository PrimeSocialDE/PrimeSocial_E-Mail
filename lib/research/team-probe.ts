// ─────────────────────────────────────────────────────────────────
// TEAM-PROBE — leichter Größen-Indikator für die Suche.
// Lädt Team-/Über-uns-Seite einer Firmen-Website und liefert (a) eine
// evtl. explizite "X Mitarbeiter"-Angabe und (b) einen Textauszug, den
// Claude für die Mitarbeiter-Schätzung nutzt. Keine API-Kosten.
// ─────────────────────────────────────────────────────────────────

export interface TeamHint {
  text: string | null;          // Auszug der besten Team-/Über-uns-Seite
  explicitCount: number | null;  // explizit genannte MA-Zahl, falls vorhanden
}

const SLUGS = ["/team", "/ueber-uns", "/unser-team", "/das-team", "/ueber-uns/team", "/praxis/team", ""];

// "über 50 Mitarbeiter", "30 Mitarbeitende", "ein Team von 12 Kollegen" …
const COUNT_RE = /(\d{1,4})\s*(?:fest\w*\s+)?(?:mitarbeiter|mitarbeitende|besch[äa]ftigte|angestellte|kolleg)/i;
const TEAM_OF_RE = /team\s+(?:aus|von)\s+(?:[üu]ber\s+)?(\d{1,4})/i;

function normalizeBase(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url.startsWith("http") ? url : `https://${url}`;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchPage(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimeSocialBot/1.0)" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// Wie stark deutet eine Seite auf eine Team-Übersicht hin?
function teamSignal(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const kw of ["unser team", "das team", "mitarbeiter", "mitarbeitende", "unsere mitarbeiter", "ansprechpartner"]) {
    if (t.includes(kw)) s += 2;
  }
  return s;
}

export async function probeTeamSize(websiteUrl: string): Promise<TeamHint> {
  const base = normalizeBase(websiteUrl);
  const results = await Promise.allSettled(
    SLUGS.map(async (slug) => ({ slug, html: await fetchPage(`${base}${slug}`) })),
  );

  let best: { text: string; signal: number } | null = null;
  let explicitCount: number | null = null;

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.html) continue;
    const text = stripHtml(r.value.html);
    if (!text) continue;

    // explizite MA-Zahl (erste plausible gewinnt)
    if (explicitCount === null) {
      const m = text.match(COUNT_RE) ?? text.match(TEAM_OF_RE);
      const n = m ? parseInt(m[1], 10) : NaN;
      if (!isNaN(n) && n >= 2 && n <= 5000) explicitCount = n;
    }

    const sig = teamSignal(text);
    if (!best || sig > best.signal) best = { text, signal: sig };
  }

  // Nur Auszug der besten Team-Seite (Token sparen); nur wenn überhaupt Team-Signal.
  const text = best && best.signal > 0 ? best.text.slice(0, 700) : null;
  return { text, explicitCount };
}
