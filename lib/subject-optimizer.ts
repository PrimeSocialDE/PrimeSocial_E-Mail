import Anthropic from "@anthropic-ai/sdk";
import { getClient, isSupabaseConfigured } from "@/lib/supabase";

interface SubjectInsight {
  segment: string;
  step_number: number;
  insights: string;        // Claude-generated insights about what works
  sample_size: number;
  avg_open_rate: number;
  top_subjects: string[];  // best performing subjects
  worst_subjects: string[]; // worst performing subjects
}

// Analyze all sent emails and generate insights per segment x step
export async function analyzeSubjectLines(): Promise<SubjectInsight[]> {
  if (!isSupabaseConfigured()) return [];

  const db = getClient();

  // Get all sent emails with their open/click status
  const { data: emails } = await db
    .from("emails_sent")
    .select("subject, step_number, opened_at, clicked_at, lead_id")
    .order("sent_at", { ascending: false });

  if (!emails || emails.length < 10) return []; // Need minimum data

  // Get lead segments
  const leadIds = [...new Set(emails.map(e => e.lead_id))];
  const { data: leads } = await db
    .from("primesocial_leads")
    .select("id, segment")
    .in("id", leadIds);

  const leadSegmentMap = new Map((leads ?? []).map(l => [l.id, l.segment]));

  // Group by segment x step
  const groups = new Map<string, { subjects: { subject: string; opened: boolean; clicked: boolean }[] }>();

  for (const email of emails) {
    const segment = leadSegmentMap.get(email.lead_id) ?? "UNKNOWN";
    const key = `${segment}:${email.step_number}`;
    if (!groups.has(key)) groups.set(key, { subjects: [] });
    groups.get(key)!.subjects.push({
      subject: email.subject,
      opened: !!email.opened_at,
      clicked: !!email.clicked_at,
    });
  }

  const insights: SubjectInsight[] = [];

  for (const [key, group] of groups) {
    const [segment, stepStr] = key.split(":");
    const step_number = parseInt(stepStr);

    if (group.subjects.length < 5) continue; // Need minimum 5 per group

    const total = group.subjects.length;
    const opened = group.subjects.filter(s => s.opened).length;
    const avg_open_rate = Math.round((opened / total) * 100);

    // Find top and worst performers
    // Group identical subjects
    const subjectStats = new Map<string, { sent: number; opened: number; clicked: number }>();
    for (const s of group.subjects) {
      if (!subjectStats.has(s.subject)) subjectStats.set(s.subject, { sent: 0, opened: 0, clicked: 0 });
      const stats = subjectStats.get(s.subject)!;
      stats.sent++;
      if (s.opened) stats.opened++;
      if (s.clicked) stats.clicked++;
    }

    const sorted = [...subjectStats.entries()]
      .map(([subject, stats]) => ({ subject, openRate: stats.opened / stats.sent, ...stats }))
      .sort((a, b) => b.openRate - a.openRate);

    const top_subjects = sorted.slice(0, 3).map(s => s.subject);
    const worst_subjects = sorted.slice(-3).map(s => s.subject);

    // Use Claude to generate insights about what patterns work
    let insightText = "";
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const topList = sorted.slice(0, 5).map(s => `"${s.subject}" (${Math.round(s.openRate * 100)}% geöffnet, ${s.sent} gesendet)`).join("\n");
      const worstList = sorted.slice(-5).map(s => `"${s.subject}" (${Math.round(s.openRate * 100)}% geöffnet, ${s.sent} gesendet)`).join("\n");

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `Analysiere diese Betreffzeilen-Performance für Cold E-Mails (Segment: ${segment}, Step ${step_number}).

BESTE Betreffzeilen:
${topList}

SCHLECHTESTE Betreffzeilen:
${worstList}

Fasse in 2-3 kurzen Regeln zusammen was funktioniert und was nicht. Nur die Muster, keine Beispiele. Antworte auf Deutsch, max 3 Sätze.`
        }]
      });
      insightText = (response.content[0] as { text: string }).text;
    } catch {
      // If Claude fails, use simple stats
      insightText = `Durchschnittliche Öffnungsrate: ${avg_open_rate}%. Top-Betreff: "${top_subjects[0] ?? "—"}".`;
    }

    insights.push({
      segment,
      step_number,
      insights: insightText,
      sample_size: total,
      avg_open_rate,
      top_subjects,
      worst_subjects,
    });
  }

  return insights;
}

// Save insights to Supabase
export async function saveSubjectInsights(insights: SubjectInsight[]): Promise<void> {
  if (!isSupabaseConfigured() || insights.length === 0) return;
  const db = getClient();

  for (const insight of insights) {
    await db.from("subject_line_insights").upsert({
      segment: insight.segment,
      step_number: insight.step_number,
      insights: insight.insights,
      sample_size: insight.sample_size,
      avg_open_rate: insight.avg_open_rate,
      top_subjects: insight.top_subjects,
      worst_subjects: insight.worst_subjects,
      updated_at: new Date().toISOString(),
    }, { onConflict: "segment,step_number" });
  }
}

// Get insights for a specific segment x step (used when generating emails)
export async function getSubjectInsight(segment: string, step: number): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const db = getClient();

  const { data } = await db
    .from("subject_line_insights")
    .select("insights, top_subjects, avg_open_rate, sample_size")
    .eq("segment", segment)
    .eq("step_number", step)
    .single();

  if (!data || data.sample_size < 10) return null; // Not enough data yet

  return `BETREFFZEILEN-OPTIMIERUNG (basierend auf ${data.sample_size} gesendeten Mails, ${data.avg_open_rate}% Öffnungsrate):
${data.insights}
Beste Betreffzeilen bisher: ${(data.top_subjects as string[]).map(s => `"${s}"`).join(", ")}`;
}

// ─────────────────────────────────────────────────────────────────
// Versandzeit-Optimierung
// ─────────────────────────────────────────────────────────────────

interface SendTimeInsight {
  best_hour: number;        // 0-23
  best_day: number;         // 0=So, 1=Mo, ..., 6=Sa
  hourly_open_rates: Record<number, { sent: number; opened: number; rate: number }>;
  daily_open_rates: Record<number, { sent: number; opened: number; rate: number }>;
  recommendation: string;
}

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export async function analyzeSendTimes(): Promise<SendTimeInsight | null> {
  if (!isSupabaseConfigured()) return null;

  const db = getClient();
  const { data: emails } = await db
    .from("emails_sent")
    .select("sent_at, opened_at, clicked_at")
    .not("sent_at", "is", null);

  if (!emails || emails.length < 20) return null;

  // Analyse nach Stunde (in deutscher Zeit, UTC+1/+2)
  const hourly: Record<number, { sent: number; opened: number }> = {};
  const daily: Record<number, { sent: number; opened: number }> = {};

  for (let h = 0; h < 24; h++) hourly[h] = { sent: 0, opened: 0 };
  for (let d = 0; d < 7; d++) daily[d] = { sent: 0, opened: 0 };

  for (const email of emails) {
    const sentDate = new Date(email.sent_at);
    // Konvertiere zu deutscher Zeit (grob UTC+1, Sommerzeit ignoriert für Einfachheit)
    const germanHour = (sentDate.getUTCHours() + 1) % 24;
    const germanDay = sentDate.getUTCDay();

    hourly[germanHour].sent++;
    daily[germanDay].sent++;

    if (email.opened_at) {
      hourly[germanHour].opened++;
      daily[germanDay].opened++;
    }
  }

  // Öffnungsraten berechnen
  const hourlyRates: Record<number, { sent: number; opened: number; rate: number }> = {};
  const dailyRates: Record<number, { sent: number; opened: number; rate: number }> = {};

  let bestHour = 8, bestHourRate = 0;
  for (const [h, stats] of Object.entries(hourly)) {
    const hour = parseInt(h);
    const rate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
    hourlyRates[hour] = { ...stats, rate };
    // Nur Stunden zwischen 5 und 21 Uhr als "beste" vorschlagen
    if (hour >= 5 && hour < 21 && stats.sent >= 3 && rate > bestHourRate) {
      bestHourRate = rate;
      bestHour = hour;
    }
  }

  let bestDay = 2, bestDayRate = 0; // Default Dienstag
  for (const [d, stats] of Object.entries(daily)) {
    const day = parseInt(d);
    const rate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
    dailyRates[day] = { ...stats, rate };
    if (stats.sent >= 3 && rate > bestDayRate) {
      bestDayRate = rate;
      bestDay = day;
    }
  }

  // Top 3 Stunden
  const topHours = Object.entries(hourlyRates)
    .filter(([, s]) => s.sent >= 3)
    .sort((a, b) => b[1].rate - a[1].rate)
    .slice(0, 3)
    .map(([h, s]) => `${h}:00 (${s.rate}%)`)
    .join(", ");

  // Top 3 Tage
  const topDays = Object.entries(dailyRates)
    .filter(([, s]) => s.sent >= 3)
    .sort((a, b) => b[1].rate - a[1].rate)
    .slice(0, 3)
    .map(([d, s]) => `${DAY_NAMES[parseInt(d)]} (${s.rate}%)`)
    .join(", ");

  const recommendation = `Beste Versandzeit: ${DAY_NAMES[bestDay]} um ${bestHour}:00 Uhr (${bestDayRate}% / ${bestHourRate}% Öffnungsrate). Top-Stunden: ${topHours}. Top-Tage: ${topDays}.`;

  return {
    best_hour: bestHour,
    best_day: bestDay,
    hourly_open_rates: hourlyRates,
    daily_open_rates: dailyRates,
    recommendation,
  };
}

export async function saveSendTimeInsight(insight: SendTimeInsight): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const db = getClient();

  await db.from("send_time_insights").upsert({
    id: "global",
    best_hour: insight.best_hour,
    best_day: insight.best_day,
    hourly_open_rates: insight.hourly_open_rates,
    daily_open_rates: insight.daily_open_rates,
    recommendation: insight.recommendation,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

export async function getBestSendTime(): Promise<{ hour: number; day: number; recommendation: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const db = getClient();

  const { data } = await db
    .from("send_time_insights")
    .select("best_hour, best_day, recommendation")
    .eq("id", "global")
    .single();

  if (!data) return null;
  return { hour: data.best_hour, day: data.best_day, recommendation: data.recommendation };
}
