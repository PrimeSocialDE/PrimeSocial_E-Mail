/**
 * Generiert nur Mail 1 (Opener-Text) für KEINEVIDEO + branding/organic (Dr. Sina Berkemann)
 * und sendet sie ohne PDF an niklas@primesocial.de.
 *
 * Ausführen: npx tsx scripts/resend-mail1-keinevideo-organic.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { Lead } from "../types";
import { generateOpener } from "../lib/anthropic";
import { sendTemplateEmail } from "../lib/brevo";
import { createClient } from "@supabase/supabase-js";

const TO_EMAIL = "niklas@primesocial.de";
const COMPANY_NAME = "[TEST] Dr. Sina Berkemann";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const { data } = await client()
    .from("primesocial_leads")
    .select("*")
    .eq("company_name", COMPANY_NAME)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) throw new Error(`Lead "${COMPANY_NAME}" nicht gefunden`);
  const lead = data[0] as Lead;

  console.log(`Lead: ${lead.id} (${lead.company_name})`);
  console.log(`Segment: ${lead.segment}`);
  console.log(`\n⏳ generateOpener...`);
  const opener = await generateOpener(lead);

  console.log(`📝 Subject: ${opener.subject}`);
  console.log(`\n--- BODY ---\n${opener.body}\n--- END ---\n`);
  console.log(`(slide1_headline: "${opener.slide1_headline}")`);
  console.log(`(case_study_key: ${opener.case_study_key})`);

  console.log(`\n📧 Versende ohne PDF an ${TO_EMAIL}...`);
  const result = await sendTemplateEmail({
    to: { email: TO_EMAIL, name: lead.contact_first_name ?? lead.company_name },
    subject: `[KEINEVIDEO-organic] ${opener.subject}`,
    bodyText: opener.body,
  });
  console.log(`✅ Versendet (Brevo ID: ${result.messageId ?? "—"})`);
}

main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
