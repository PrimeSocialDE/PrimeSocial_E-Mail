import { NextRequest, NextResponse } from "next/server";
import { checkLeadByEmail, getManualHistoryForRecipient } from "@/lib/manual/db";
import { getProspectByEmail } from "@/lib/research/db";

// Kombinierter Empfänger-Check für die Schreiben-Seite:
//  - lead:     rein lesender Abgleich gegen primesocial_leads (Automation)
//  - manual:   frühere manuelle Mails an dieselbe Adresse
//  - research: liegt die Adresse schon in der Recherche-Queue?
export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email fehlt" }, { status: 400 });
    const [lead, manual, research] = await Promise.all([
      checkLeadByEmail(email),
      getManualHistoryForRecipient(email),
      getProspectByEmail(email),
    ]);
    return NextResponse.json({ lead, manual, research });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
