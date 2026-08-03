/**
 * Setzt den Status der Test-Pitch-Seite auf "published", damit /p/[slug] sie ausspielt.
 * Ausführen: npx tsx scripts/publish-test-pitch.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { updatePitchPage, getPitchPageByLeadId } from "../lib/supabase";

const LEAD_ID = "8c25adae-509e-4749-9f3e-98e42fa0b77b";

async function run() {
  const pitch = await getPitchPageByLeadId(LEAD_ID);
  if (!pitch) {
    console.error(`Keine Pitch-Seite für Lead ${LEAD_ID} gefunden.`);
    process.exit(1);
  }
  console.log(`Pitch gefunden: slug=${pitch.slug}, status=${pitch.status}`);
  await updatePitchPage(pitch.id, {
    status: "published",
    published_at: new Date().toISOString(),
  });
  console.log(`✅ Status auf "published" gesetzt. Live: https://mail.primesocial.de/p/${pitch.slug}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
