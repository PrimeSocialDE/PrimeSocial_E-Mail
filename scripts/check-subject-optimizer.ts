import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  for (const t of ["subject_line_insights", "send_time_insights"]) {
    const { error, count } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`${t}: ${error ? "❌ " + error.message : `✅ vorhanden (${count} Zeilen)`}`);
  }

  // Aktuelle Insights anzeigen falls vorhanden
  const { data: insights } = await sb
    .from("subject_line_insights")
    .select("segment, step_number, avg_open_rate, sample_size, top_subjects, updated_at")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (insights && insights.length > 0) {
    console.log("\nLetzte Subject-Insights:");
    for (const i of insights) {
      console.log(`  [${i.segment} · Step ${i.step_number}]  ${i.avg_open_rate}% Open (n=${i.sample_size})`);
      console.log(`    Top: ${(i.top_subjects ?? []).slice(0, 2).join(" | ")}`);
    }
  } else {
    console.log("\n(Keine Insights in der DB)");
  }
}
run();
