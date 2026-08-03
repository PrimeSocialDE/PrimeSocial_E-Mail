import { NextRequest, NextResponse } from "next/server";
import { getPitchPageBySlug, getLead, saveReferenceRequest } from "@/lib/supabase";
import { sendTransactionalEmail } from "@/lib/brevo";
import { CONTACT } from "@/lib/pitch-constants";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c] ?? c);
}

export async function POST(request: NextRequest) {
  // Rate-Limit: 5 Submissions pro IP pro 10 Minuten — public Form, ohne
  // Schutz wäre Bot-Spam möglich (DB-Müll + Brevo-Volumen).
  const clientIp = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`references-request:${clientIp}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }, { status: 429 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      phone?: string;
    };

    const name = (body.name ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const slug = (body.slug ?? "").trim();

    if (!name || !phone) {
      return NextResponse.json({ error: "Name und Telefonnummer sind Pflichtfelder." }, { status: 400 });
    }
    if (!slug) {
      return NextResponse.json({ error: "Pitch-Referenz fehlt." }, { status: 400 });
    }
    // Sanity-Bounds: schützt gegen 1MB-Strings die DB und Brevo-Mail bombardieren.
    if (name.length > 200 || phone.length > 50 || slug.length > 200) {
      return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
    }

    const pitch = await getPitchPageBySlug(slug);
    if (!pitch) {
      return NextResponse.json({ error: "Pitch-Seite nicht gefunden." }, { status: 404 });
    }

    // E-Mail und Firma kennen wir aus dem verknüpften Lead
    let leadEmail: string | null = null;
    let leadCompany: string | null = pitch.company_name_display;
    try {
      const lead = await getLead(pitch.lead_id);
      leadEmail = lead.email ?? null;
      leadCompany = leadCompany ?? lead.company_name ?? null;
    } catch {
      // Lead wurde gelöscht — ok, wir speichern trotzdem
    }

    const saved = await saveReferenceRequest({
      pitch_page_id: pitch.id,
      name,
      company: leadCompany,
      email: leadEmail,
      phone,
      message: null,
    });

    // Benachrichtigung an Niklas (non-blocking)
    try {
      const lines = [
        `Name: ${name}`,
        `Telefon: ${phone}`,
        leadCompany ? `Firma: ${leadCompany}` : null,
        leadEmail ? `Lead-E-Mail: ${leadEmail}` : null,
        "",
        `Pitch-Seite: ${pitch.slug} (focus: ${pitch.focus_area ?? "—"})`,
      ].filter(Boolean).join("\n");
      await sendTransactionalEmail({
        to: { email: CONTACT.email, name: CONTACT.name },
        subject: `Neue Referenz-Anfrage: ${name}${leadCompany ? ` (${leadCompany})` : ""}`,
        htmlContent: `<pre style="font-family:inherit;white-space:pre-wrap;margin:0;">${escapeHtml(lines)}</pre>`,
        textContent: lines,
      });
    } catch (mailError) {
      console.error("[references/request] Mail-Notify fehlgeschlagen:", mailError);
    }

    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e) {
    console.error("[references/request]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
