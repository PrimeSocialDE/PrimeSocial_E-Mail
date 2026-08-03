import { NextResponse } from "next/server";
import { getClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ subjects: [], insights: [] });
  }

  const db = getClient();

  // Get all sent emails
  const { data: emails } = await db
    .from("emails_sent")
    .select("subject, step_number, opened_at, clicked_at, lead_id, sent_at")
    .order("sent_at", { ascending: false });

  if (!emails || emails.length === 0) {
    return NextResponse.json({ subjects: [], insights: [] });
  }

  // Get lead segments
  const leadIds = [...new Set(emails.map((e) => e.lead_id))];
  const { data: leads } = await db
    .from("primesocial_leads")
    .select("id, segment")
    .in("id", leadIds);

  const leadSegmentMap = new Map(
    (leads ?? []).map((l) => [l.id, l.segment as string])
  );

  // Group by subject + segment + step
  const subjectMap = new Map<
    string,
    {
      segment: string;
      step_number: number;
      subject: string;
      sent: number;
      opened: number;
      clicked: number;
    }
  >();

  for (const email of emails) {
    const segment = leadSegmentMap.get(email.lead_id) ?? "UNKNOWN";
    const key = `${segment}:${email.step_number}:${email.subject}`;

    if (!subjectMap.has(key)) {
      subjectMap.set(key, {
        segment,
        step_number: email.step_number,
        subject: email.subject,
        sent: 0,
        opened: 0,
        clicked: 0,
      });
    }

    const entry = subjectMap.get(key)!;
    entry.sent++;
    if (email.opened_at) entry.opened++;
    if (email.clicked_at) entry.clicked++;
  }

  const subjects = [...subjectMap.values()]
    .map((s) => ({
      ...s,
      open_rate: s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0,
      click_rate: s.sent > 0 ? Math.round((s.clicked / s.sent) * 100) : 0,
    }))
    .sort((a, b) => b.open_rate - a.open_rate);

  // Get saved insights
  const { data: insights } = await db
    .from("subject_line_insights")
    .select("segment, step_number, insights, sample_size, avg_open_rate, top_subjects, worst_subjects, updated_at")
    .order("avg_open_rate", { ascending: false });

  return NextResponse.json({
    subjects,
    insights: insights ?? [],
  });
}
