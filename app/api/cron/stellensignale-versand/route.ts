/**
 * Versand-Cron für das STELLENSIGNAL-Modul.
 *
 * Läuft im Sendefenster alle 30 Minuten und schickt einen kleinen Teil des
 * Tagesbudgets raus. Verschickt AUSSCHLIESSLICH Entwürfe mit status
 * 'freigegeben' — solange niemand freigibt, passiert hier nichts.
 *
 * Sicherheit: CRON_SECRET wie bei allen anderen Crons, plus der harte
 * Kill-Switch STELLENSIGNALE_VERSAND_ENABLED in der Versandlogik selbst.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendeFreigegebene } from "@/lib/stellensignale/versand";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendeFreigegebene();
    if (result.fehler.length > 0) {
      console.warn(`[versand-cron] ${result.fehler.length} Fehler:`, result.fehler.slice(0, 5));
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[versand-cron] Abbruch:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
