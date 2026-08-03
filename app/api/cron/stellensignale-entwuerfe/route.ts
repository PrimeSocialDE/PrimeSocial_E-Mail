/**
 * Entwurfs-Cron für das STELLENSIGNAL-Modul.
 *
 * Schließt die Lücke in der Kette: Signale entstanden bisher automatisch,
 * Entwürfe aber nur auf Klick in der UI.
 *
 * KOSTENKONTROLLE — das Wichtigste an dieser Route:
 * Jeder Entwurf ist ein Claude-Aufruf und kostet Geld. Deshalb richtet sich
 * die Menge NICHT nach "was ginge", sondern nach dem, was der Versand
 * tatsächlich abnehmen kann. In der Warmup-Woche 1 gehen 5 Mails am Tag raus —
 * dann 25 Entwürfe zu schreiben hieße, 80 % der Tokens wegzuwerfen.
 *
 * Formel: Ziel ist ein Vorrat von zwei Tagesbudgets. Was schon als Entwurf
 * oder freigegeben herumliegt, wird abgezogen. Nur die Differenz wird neu
 * erzeugt, gedeckelt durch STELLENSIGNALE_ENTWURF_LIMIT.
 */
import { NextRequest, NextResponse } from "next/server";
import { runEntwuerfe } from "@/lib/stellensignale/entwurf";
import { tagesbudget } from "@/lib/stellensignale/versand";
import { zaehleOffeneEntwuerfe } from "@/lib/stellensignale/db";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Eigener Kill-Switch, unabhängig vom Crawl. So lässt sich die
  // Entwurfs-Generierung stoppen, ohne die Datensammlung anzuhalten.
  if (process.env.STELLENSIGNALE_ENTWUERFE_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "STELLENSIGNALE_ENTWUERFE_ENABLED nicht gesetzt" });
  }

  try {
    const { budget, stufe } = tagesbudget();
    const offen = await zaehleOffeneEntwuerfe();
    const vorrat = offen.entwurf + offen.freigegeben;

    // Zwei Tagesbudgets Vorrat reichen: genug Puffer, falls du einen Tag nicht
    // zum Freigeben kommst, ohne auf Halde zu produzieren.
    const zielVorrat = budget * 2;
    const deckel = parseInt(process.env.STELLENSIGNALE_ENTWURF_LIMIT ?? "15", 10);
    const limit = Math.max(0, Math.min(zielVorrat - vorrat, deckel));

    if (limit === 0) {
      return NextResponse.json({
        ok: true,
        uebersprungen: "Vorrat reicht",
        vorrat, zielVorrat, budget, stufe,
      });
    }

    const result = await runEntwuerfe({ limit });
    if (result.fehler.length > 0) {
      console.warn(`[entwuerfe-cron] ${result.fehler.length} Fehler:`, result.fehler.slice(0, 5));
    }
    return NextResponse.json({ ok: true, limit, vorrat, zielVorrat, budget, stufe, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[entwuerfe-cron] Abbruch:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
