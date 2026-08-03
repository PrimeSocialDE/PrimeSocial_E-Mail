// ─────────────────────────────────────────────────────────────────
// INSTAGRAM (on request) — Instagram wird NUR auf Anfrage gescraped,
// nicht automatisch in der Enrich-Pipeline. Findet den Handle auf der
// Website, scraped das Profil und lässt das Dossier mit IG-Daten neu
// bewerten (Schwächen + Aufhänger).
// ─────────────────────────────────────────────────────────────────
import { scrapeInstagramProfile } from "@/lib/apify";
import { qualifyProspect } from "@/lib/research/qualify";
import { updateProspect, normHandle, domainOf, buildDedupKey } from "@/lib/research/db";
import { upsertCompany } from "@/lib/company/db";
import type { ResearchProspect } from "@/types/research";
import type { InstagramData } from "@/types";

// Instagram-Handle aus dem Homepage-HTML extrahieren.
async function findInstagramHandle(websiteUrl: string): Promise<string | null> {
  try {
    const base = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(base, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimeSocialBot/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
    if (!m?.[1]) return null;
    const handle = m[1].toLowerCase();
    if (["p", "reel", "explore", "accounts", "stories", "share"].includes(handle)) return null;
    return normHandle(handle);
  } catch {
    return null;
  }
}

// Scraped Instagram für einen Prospect (auf Anfrage) und bewertet neu.
export async function scrapeInstagramForProspect(prospect: ResearchProspect): Promise<ResearchProspect> {
  // Handle bestimmen: vorhandener oder von der Website ziehen.
  let handle = prospect.instagram_handle;
  if (!handle && prospect.website) handle = await findInstagramHandle(prospect.website);

  let igData: InstagramData | null = null;
  if (handle) {
    try {
      igData = await scrapeInstagramProfile(handle);
    } catch (e) {
      console.warn(`[research/instagram] Scrape fehlgeschlagen für @${handle}:`, e);
    }
  }

  // Handle + checked-Flag setzen (auch wenn kein Account → checked=true, handle ggf. null).
  const dedupKey = buildDedupKey(domainOf(prospect.website), handle);
  const updated = await updateProspect(prospect.id, {
    instagram_handle: handle,
    instagram_checked: true,
    dedup_key: dedupKey ?? prospect.dedup_key,
  });

  // Gefundenen IG-Account + Daten zentral zuordnen.
  if (handle) {
    try {
      await upsertCompany({
        company_name: prospect.company_name,
        website: prospect.website,
        stadt: prospect.city,
        bundesland: prospect.bundesland,
        instagram_handle: handle,
        instagram_data: igData,
        source: "research",
      });
    } catch (e) { console.warn("[research/instagram] upsertCompany fehlgeschlagen:", e); }
  }

  // Mit IG-Daten neu bewerten (igChecked=true) → Schwächen + Aufhänger aktualisieren.
  return qualifyProspect(updated, igData, true);
}
