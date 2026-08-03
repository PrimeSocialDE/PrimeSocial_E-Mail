/**
 * Updated den Hero-Block der Leadgen- und Branding-Variante von Schreinerei
 * Bergmann (Mitarbeiter-Zahl raus, Lead-Type als Kontext-Suffix).
 *
 * Aufruf: npx tsx scripts/update-pitch-hero-leadgen-branding.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const UPDATES: { slug: string; hero_meta: string }[] = [
  {
    slug: "schreinerei-bergmann-gmbh-meta-ads",
    hero_meta: "Schreinerei · Bremen · Kundengewinnung",
  },
  {
    slug: "schreinerei-bergmann-gmbh-organic",
    hero_meta: "Schreinerei · Bremen · Organisches Wachstum",
  },
];

async function run() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  for (const u of UPDATES) {
    const { data, error } = await sb
      .from("pitch_pages")
      .update({ hero_meta: u.hero_meta })
      .eq("slug", u.slug)
      .select("slug, hero_meta")
      .single();
    if (error) {
      console.error(`❌ ${u.slug}: ${error.message}`);
      continue;
    }
    console.log(`✅ ${data.slug} → "${data.hero_meta}"`);
  }
}
run();
