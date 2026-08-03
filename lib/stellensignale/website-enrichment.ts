// ─────────────────────────────────────────────────────────────────
// WEBSITE-ANREICHERUNG — schließt die Lücke zwischen Arbeitsagentur und
// E-Mail-Findung.
//
// Ablauf je Firma ohne Website:
//   1. Website über den Firmennamen ermitteln (kostenlos, HTTP)
//   2. Verrät die Seite einen Personaldienstleister → Firma sperren
//   3. Sonst Website speichern → der bestehende Email-Finder greift danach
//
// Gedeckelt über STELLENSIGNALE_WEBSITE_LIMIT. Kostet kein Geld, aber Zeit
// und fremde Serverlast — deshalb nicht unbegrenzt.
// ─────────────────────────────────────────────────────────────────
import { getZielfirmen, updateZielfirma } from "@/lib/stellensignale/db";
import { findeWebsite } from "@/lib/stellensignale/website-finder";
import type { ZielfirmaStatus } from "@/types/stellensignale";

export interface WebsiteEnrichmentResult {
  geprueft: number;
  gefunden: number;
  gesperrt: number;
  ohneTreffer: number;
  proben: string[];
  abgebrochen: boolean;
}

export async function runWebsiteEnrichment(opts?: {
  limit?: number;
  deadlineMs?: number;
}): Promise<WebsiteEnrichmentResult> {
  const result: WebsiteEnrichmentResult = {
    geprueft: 0, gefunden: 0, gesperrt: 0, ohneTreffer: 0, proben: [], abgebrochen: false,
  };

  const limit = opts?.limit ?? parseInt(process.env.STELLENSIGNALE_WEBSITE_LIMIT ?? "40", 10);
  const deadline = Date.now() + (opts?.deadlineMs ?? 120_000);

  // Nur aktive Firmen OHNE Website — die anderen brauchen den Schritt nicht.
  const alle = await getZielfirmen({ status: "aktiv" });
  const offen = alle.filter((f) => !f.website).slice(0, limit);

  // Begrenzte Parallelität: schnell genug, ohne fremde Server zu belasten.
  const PARALLEL = 4;
  let index = 0;

  async function arbeiter(): Promise<void> {
    while (true) {
      if (Date.now() > deadline) { result.abgebrochen = true; return; }
      const i = index++;
      if (i >= offen.length) return;
      const f = offen[i];
      result.geprueft++;

      const fund = await findeWebsite(f.firma, f.ort);
      if (!fund) { result.ohneTreffer++; continue; }

      if (fund.pdlGrund) {
        // Erst die Website verrät den Personaldienstleister — der Firmenname
        // gibt ihn oft nicht her ("TECH-PLUS", "nEw siMple woRk").
        await updateZielfirma(f.id, {
          website: fund.website,
          status: "gesperrt" as ZielfirmaStatus,
        });
        result.gesperrt++;
        if (result.proben.length < 20) result.proben.push(`⛔ ${f.firma} — ${fund.pdlGrund}`);
        continue;
      }

      await updateZielfirma(f.id, { website: fund.website });
      result.gefunden++;
      if (result.proben.length < 20) result.proben.push(`✅ ${f.firma} → ${fund.website}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL, offen.length) }, arbeiter));
  return result;
}
