import { NextResponse } from "next/server";
import { getClient, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ heatmap: [], recommendation: null });
  }

  const db = getClient();

  const { data: emails } = await db
    .from("emails_sent")
    .select("sent_at, opened_at")
    .not("sent_at", "is", null);

  if (!emails || emails.length === 0) {
    return NextResponse.json({ heatmap: [], recommendation: null });
  }

  // Build day x hour matrix
  // day: 0=Mo, 1=Di, ..., 6=So (ISO week order for display)
  const matrix: Record<string, { sent: number; opened: number }> = {};

  for (let d = 0; d < 7; d++) {
    for (let h = 5; h <= 21; h++) {
      matrix[`${d}:${h}`] = { sent: 0, opened: 0 };
    }
  }

  for (const email of emails) {
    const sentDate = new Date(email.sent_at);
    // Convert to German time (approx UTC+1)
    const germanHour = (sentDate.getUTCHours() + 1) % 24;
    // Convert JS day (0=So) to ISO (0=Mo)
    const jsDay = sentDate.getUTCDay();
    const isoDay = jsDay === 0 ? 6 : jsDay - 1; // Mo=0, Di=1, ..., So=6

    if (germanHour >= 5 && germanHour <= 21) {
      const key = `${isoDay}:${germanHour}`;
      if (!matrix[key]) matrix[key] = { sent: 0, opened: 0 };
      matrix[key].sent++;
      if (email.opened_at) matrix[key].opened++;
    }
  }

  // Convert to array for frontend
  const heatmap = Object.entries(matrix).map(([key, stats]) => {
    const [day, hour] = key.split(":").map(Number);
    return {
      day,
      hour,
      sent: stats.sent,
      opened: stats.opened,
      open_rate: stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0,
    };
  });

  // Get saved recommendation
  const { data: insight } = await db
    .from("send_time_insights")
    .select("best_hour, best_day, recommendation, hourly_open_rates, daily_open_rates")
    .eq("id", "global")
    .single();

  return NextResponse.json({
    heatmap,
    recommendation: insight?.recommendation ?? null,
    best_hour: insight?.best_hour ?? null,
    best_day: insight?.best_day ?? null,
  });
}
