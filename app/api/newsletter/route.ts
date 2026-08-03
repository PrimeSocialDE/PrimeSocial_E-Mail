import { NextRequest, NextResponse } from "next/server";
import { getNewsletters, saveNewsletter, getSubscribers } from "@/lib/supabase";
import { generateNewsletterContent } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const [newsletters, subscribers] = await Promise.all([
      getNewsletters(),
      getSubscribers(),
    ]);
    return NextResponse.json({ newsletters, subscriberCount: subscribers.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, subject, body_html, body_text } = body;

    let finalSubject = subject;
    let finalHtml = body_html;
    let finalText = body_text;

    // Wenn ein Brief vorhanden → Claude generiert den Inhalt
    if (brief) {
      const generated = await generateNewsletterContent(brief);
      finalSubject = generated.subject;
      finalHtml    = generated.body_html;
      finalText    = generated.body_text;
    }

    if (!finalSubject || !finalHtml) {
      return NextResponse.json({ error: "subject und body_html (oder brief) sind Pflicht" }, { status: 400 });
    }

    const nl = await saveNewsletter({
      subject:         finalSubject,
      body_html:       finalHtml,
      body_text:       finalText ?? "",
      status:          "draft",
      sent_at:         null,
      recipient_count: 0,
    });

    return NextResponse.json(nl, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
