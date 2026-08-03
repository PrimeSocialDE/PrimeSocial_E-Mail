import { NextRequest, NextResponse } from "next/server";
import { chatRewrite, type ManualChatTurn } from "@/lib/manual/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chat-Turn zum aktiven Umschreiben der Mail. Darf subject/body zurückliefern.
export async function POST(req: NextRequest) {
  try {
    const { history, draft } = await req.json();
    if (!draft || (!draft.subject && !draft.body)) {
      return NextResponse.json({ error: "Entwurf fehlt" }, { status: 400 });
    }
    const turns: ManualChatTurn[] = Array.isArray(history)
      ? history.filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      : [];
    const result = await chatRewrite(turns, { subject: draft.subject ?? "", body: draft.body ?? "" });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
