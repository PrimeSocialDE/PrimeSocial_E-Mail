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
import { fuelleFreigabe } from "@/lib/stellensignale/autofreigabe";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Vor dem Versand die Warteschlange auffuellen. Bewusst hier und nicht in
    // einem eigenen Cron: so kann der Vorrat gar nicht erst leerlaufen,
    // waehrend der Versand danebensteht und nichts zu tun hat. Ist der
    // Schalter aus, kehrt das sofort und folgenlos zurueck.
    let freigabe: Awaited<ReturnType<typeof fuelleFreigabe>> | null = null;
    try {
      freigabe = await fuelleFreigabe();
      if (freigabe.freigegeben > 0) {
        console.log(`[versand-cron] ${freigabe.freigegeben} Entwuerfe automatisch freigegeben`);
      }
    } catch (e) {
      // Eine gescheiterte Freigabe darf den Versand dessen nicht aufhalten,
      // was bereits freigegeben ist.
      console.warn("[versand-cron] Autofreigabe fehlgeschlagen:", e);
    }

    const result = await sendeFreigegebene();
    if (result.fehler.length > 0) {
      console.warn(`[versand-cron] ${result.fehler.length} Fehler:`, result.fehler.slice(0, 5));
    }
    return NextResponse.json({ ok: true, ...result, freigabe });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[versand-cron] Abbruch:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
