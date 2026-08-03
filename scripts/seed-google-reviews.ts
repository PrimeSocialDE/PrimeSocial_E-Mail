/**
 * Seedet die google_reviews Tabelle mit den 5 echten Google-Bewertungen aus
 * GOOGLE_REVIEWS_SEED. Idempotent — kann mehrfach ausgeführt werden.
 *
 * Voraussetzung: SQL-Migration für google_reviews Tabelle ist in Supabase ausgeführt.
 *
 * Ausführen: npx tsx scripts/seed-google-reviews.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { upsertGoogleReviewByName, getAllGoogleReviews } from "../lib/supabase";
import { GOOGLE_REVIEWS_SEED } from "../lib/pitch-constants";

async function run() {
  console.log(`Seede ${GOOGLE_REVIEWS_SEED.length} Google-Reviews…`);
  for (const seed of GOOGLE_REVIEWS_SEED) {
    const saved = await upsertGoogleReviewByName({
      reviewer_name: seed.reviewer_name,
      reviewer_image_url: seed.reviewer_image_url,
      review_text: seed.review_text,
      rating: seed.rating,
      review_date: seed.review_date,
      is_active: true,
      display_order: seed.display_order,
    });
    console.log(`  ✓ ${saved.reviewer_name} (${saved.rating}★)`);
  }

  const all = await getAllGoogleReviews();
  console.log(`\nGesamt in DB: ${all.length} Reviews`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
