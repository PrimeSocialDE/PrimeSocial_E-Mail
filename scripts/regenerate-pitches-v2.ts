/**
 * Regeneriert die Test-Pitches mit dem neuen Claude-Prompt v2:
 * Drei ECHTE Claude-Generations, eine pro Lead-Typ — damit jede Seite
 * thematisch komplett anders aussieht (Hero, Konzept, Plattformen, CTA).
 *
 * Variante 1: lead_type=recruiting,  focus_area=recruiting
 * Variante 2: lead_type=branding,    focus_area=organic
 * Variante 3: lead_type=leadgen,     focus_area=meta_ads
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";

import {
  getClient,
  getPitchPageByLeadId,
  createPitchPage,
  updatePitchPage,
  saveEmailSent,
} from "../lib/supabase";
import { generatePitchPageContent } from "../lib/anthropic";
import { sendTransactionalEmail } from "../lib/brevo";
import {
  matchCaseStudies,
  buildPitchUrl,
  generatePitchSlug,
  BRAND_GRADIENT,
  BRAND_GRADIENT_START,
  BRAND_GRADIENT_TEXT,
  type PitchFocusArea,
} from "../lib/pitch-constants";
import type { Lead, PitchPage, GeneratedPitchContent, PitchLeadType } from "../types";

const RECIPIENT = "niklas@primesocial.de";
const STATE_FILE = path.join(process.cwd(), "scripts", ".pitch-testrun-state.json");

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

interface Variant {
  label: string;
  slugSuffix: string;
  leadType: PitchLeadType;
  focusArea: PitchFocusArea;
}

const VARIANTS: Variant[] = [
  { label: "Recruiting",           slugSuffix: "recruiting", leadType: "recruiting", focusArea: "recruiting" },
  { label: "Organisches Wachstum", slugSuffix: "organic",    leadType: "branding",   focusArea: "organic" },
  { label: "Meta Ads",             slugSuffix: "meta-ads",   leadType: "leadgen",    focusArea: "meta_ads" },
];

async function generateVariantPitch(
  lead: Lead,
  variant: Variant,
  baseSlug: string,
  isPrimary: boolean,
): Promise<{ url: string; content: GeneratedPitchContent }> {
  log(`Generiere Variante "${variant.label}" via Claude…`);
  const content = await generatePitchPageContent(lead, {
    forceLeadType: variant.leadType,
    forceFocusArea: variant.focusArea,
  });
  log(`  ← lead_type=${content.lead_type}, focus_area=${content.focus_area}, platforms=[${content.platforms.join(", ")}], third_card=${content.third_card_type}`);
  log(`  ← Hero: "${content.hero_headline}"`);

  const branche = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
  const matched = matchCaseStudies(content.focus_area, branche);

  const targetSlug = isPrimary ? baseSlug : `${baseSlug.replace(/-[a-z0-9]+$/, "")}-${variant.slugSuffix}`;
  const now = new Date().toISOString();

  const fields = {
    lead_id: lead.id,
    focus_area: content.focus_area,
    focus_reasoning: content.focus_reasoning,
    lead_type: content.lead_type,
    third_card_type: content.third_card_type,
    platforms: content.platforms,
    platform_strategy: content.platform_strategy,
    hero_headline: content.hero_headline,
    hero_subline_accent: content.hero_subline_accent,
    hero_text: content.hero_text,
    hero_meta: content.hero_meta,
    konzept_blocks: content.konzept_blocks,
    content_strategie_blocks: null,
    content_examples_branche: branche || null,
    case_studies_keys: matched.map((c) => c.key),
    vorgehen_blocks: content.vorgehen_blocks,
    cta_headline: content.cta_headline,
    cta_text: content.cta_text,
    company_name_display: lead.company_name,
  };

  // Existierenden Datensatz finden (per Slug)
  const { data: existingArr } = await getClient()
    .from("pitch_pages")
    .select("*")
    .eq("slug", targetSlug)
    .limit(1);
  const existing = ((existingArr ?? [])[0] as PitchPage | undefined);

  if (existing) {
    await updatePitchPage(existing.id, { ...fields, status: "published", published_at: existing.published_at ?? now });
  } else {
    await createPitchPage({ ...fields, slug: targetSlug, status: "published", published_at: now });
  }
  return { url: buildPitchUrl(targetSlug), content };
}

function buttonHtml(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0;"><tr><td>
      <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;background-color:${BRAND_GRADIENT_START};background-image:${BRAND_GRADIENT};color:${BRAND_GRADIENT_TEXT};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">${label}</a>
    </td></tr></table>`;
}

async function run() {
  log("=== Regenerate v2 — drei echte Claude-Generations ===");
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as { leadId?: string };
  if (!state.leadId) throw new Error("Kein leadId in State");

  const { data } = await getClient().from("primesocial_leads").select("*").eq("id", state.leadId).single();
  const lead = data as Lead;
  log(`Lead: ${lead.company_name}`);

  // Basis-Pitch (primärer Slug = was der Lead in Mails sehen würde)
  const existingPrimary = await getPitchPageByLeadId(lead.id);
  const baseSlug = existingPrimary?.slug ?? generatePitchSlug(lead.company_name);

  const results: { variant: Variant; url: string; content: GeneratedPitchContent }[] = [];
  for (let i = 0; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    const { url, content } = await generateVariantPitch(lead, v, baseSlug, i === 0);
    results.push({ variant: v, url, content });
  }

  // Mail bauen
  const buttonsHtml = results
    .map((r) => `
      <p style="margin:24px 0 6px;font-size:14px;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-weight:600;">
        ${r.variant.label}
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">
        lead_type=${r.content.lead_type} · platforms=${r.content.platforms.join(", ")} · third_card=${r.content.third_card_type}
      </p>
      ${buttonHtml("Landing-Page öffnen", r.url)}
    `)
    .join("");

  const intro = `
    <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;">
      Drei <strong>thematisch unterschiedliche</strong> Pitch-Seiten für ${lead.company_name}.
      Jede ist ein eigenständiger Claude-Generation mit anderem lead_type.
    </p>
  `;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#ffffff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
<tr><td align="center" style="padding:32px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td>
${intro}
${buttonsHtml}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text =
    `Drei thematisch unterschiedliche Pitch-Seiten für ${lead.company_name}:\n\n` +
    results.map((r) => `${r.variant.label} (lead_type=${r.content.lead_type}): ${r.url}`).join("\n");

  const subject = "[Testrun v2.1] 3 thematisch unterschiedliche Landing-Pages";

  const record = await saveEmailSent({
    lead_id: lead.id,
    step_number: 0,
    step_name: "regenerate-v2.1",
    subject,
    body_html: html,
    body_text: text,
    pdf_url: null,
    brevo_message_id: null,
    sent_to_email: RECIPIENT,
    sent_at: new Date().toISOString(),
    opened_at: null,
    clicked_at: null,
    bounced: false,
  });

  const trackingPixel = `<img src="https://mail.primesocial.de/api/track/open?id=${record.id}" width="1" height="1" style="display:none;" alt="">`;
  const finalHtml = html.replace("</body>", `${trackingPixel}</body>`);

  const res = await sendTransactionalEmail({
    to: { email: RECIPIENT, name: "Niklas" },
    subject,
    htmlContent: finalHtml,
    textContent: text,
  });

  log(`✉️  Gesendet — Brevo-ID: ${res.messageId ?? "?"}`);
  for (const r of results) log(`   ${r.variant.label}: ${r.url}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
