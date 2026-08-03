import { NextRequest, NextResponse } from "next/server";
import { getEmailTips } from "@/lib/manual/anthropic";
import { getManualEmails } from "@/lib/manual/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Datengetriebene AI-Tipps. Gibt NUR Hinweise zurück, schreibt die Mail NICHT.
export async function POST(req: NextRequest) {
  try {
    const { subject, body } = await req.json();
    if (!body && !subject) {
      return NextResponse.json({ error: "Entwurf (subject/body) fehlt" }, { status: 400 });
    }
    // Letzte ~30 versendete Mails als Lernkontext (Betreff, geöffnet, Antwort).
    const all = await getManualEmails();
    const history = all
      .filter((e) => e.sent_at)
      .slice(0, 30)
      .map((e) => ({ subject: e.subject, opened_at: e.opened_at, response_status: e.response_status }));

    const result = await getEmailTips({ subject: subject ?? "", body: body ?? "" }, history);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
