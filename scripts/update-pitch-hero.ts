/**
 * Updated den Hero-Block einer bestehenden Pitch-Page nach den neuen Regeln:
 * - hero_meta ohne Mitarbeiter-Zahlen
 * - hero_text mit konkretem Social-Media-Bezug im dritten Satz
 *
 * Aufruf: npx tsx scripts/update-pitch-hero.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const SLUG = "schreinerei-bergmann-gmbh-recruiting";

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const updates = {
    hero_meta: "Schreinerei · Bremen · Recruiting",
    hero_text:
      "Im Handwerk sucht man Gesellen oft monatelang vergeblich, weil die richtigen Leute gar nicht aktiv nach Jobs schauen. Klassische Stellenanzeigen erreichen den falschen Personenkreis. Über Social Media erreicht ihr genau diese Leute dort, wo sie sich täglich aufhalten — auch ohne aktive Jobsuche.",
  };

  const { data, error } = await sb
    .from("pitch_pages")
    .update(updates)
    .eq("slug", SLUG)
    .select("hero_meta, hero_text")
    .single();
  if (error) { console.error(error); process.exit(1); }
  console.log("✅ Updated:");
  console.log(JSON.stringify(data, null, 2));
}
run();
