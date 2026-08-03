import { NextRequest, NextResponse } from "next/server";
import { generateTemplateFromExamples } from "@/lib/manual/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

// Beispielmails → Template + erkannte Platzhalter via Claude.
// Generiert nur, speichert NICHT (Speichern läuft über POST /api/manual/templates).
export async function POST(req: NextRequest) {
  try {
    const { examples } = await req.json();
    if (!examples || typeof examples !== "string" || examples.trim().length < 20) {
      return NextResponse.json({ error: "Bitte mindestens eine Beispielmail einfügen." }, { status: 400 });
    }
    const result = await generateTemplateFromExamples(examples);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
