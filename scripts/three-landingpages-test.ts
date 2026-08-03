/**
 * Erstellt drei Pitch-Page-Klone für den Test-Lead — eine pro Fokus-Bereich
 * (recruiting | organic | meta_ads) — und schickt eine schlichte Mail mit drei
 * Buttons an niklas@primesocial.de.
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
import type { Lead, PitchPage } from "../types";

const RECIPIENT = "niklas@primesocial.de";
const STATE_FILE = path.join(process.cwd(), "scripts", ".pitch-testrun-state.json");

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

const FOCUS_LABELS: Record<PitchFocusArea, string> = {
  recruiting: "Recruiting",
  organic: "Organisches Wachstum",
  meta_ads: "Meta Ads",
};

async function clonePitchForFocus(
  basePitch: PitchPage,
  lead: Lead,
  focus: PitchFocusArea,
): Promise<{ slug: string; url: string }> {
  // Bestehenden Klon zu diesem Focus suchen — falls schon da, neu publishen
  const { data: existingArr } = await getClient()
    .from("pitch_pages")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("focus_area", focus);
  const existing = (existingArr ?? []).find(
    (p: PitchPage) => p.slug.endsWith(`-${focus.replace("_", "-")}`),
  ) as PitchPage | undefined;

  const branche = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
  const matched = matchCaseStudies(focus, branche);
  const now = new Date().toISOString();

  if (existing) {
    await updatePitchPage(existing.id, {
      focus_area: focus,
      case_studies_keys: matched.map((c) => c.key),
      status: "published",
      published_at: existing.published_at ?? now,
    });
    return { slug: existing.slug, url: buildPitchUrl(existing.slug) };
  }

  const baseSlug = generatePitchSlug(lead.company_name).replace(/-[a-z0-9]+$/, "");
  const slug = `${baseSlug}-${focus.replace("_", "-")}`;

  const created = await createPitchPage({
    lead_id: lead.id,
    slug,
    status: "draft",
    focus_area: focus,
    focus_reasoning: `Manueller Override für Test-Vergleich (${focus})`,
    hero_headline: basePitch.hero_headline,
    hero_subline_accent: basePitch.hero_subline_accent,
    hero_text: basePitch.hero_text,
    hero_meta: basePitch.hero_meta,
    konzept_blocks: basePitch.konzept_blocks,
    content_strategie_blocks: basePitch.content_strategie_blocks,
    content_examples_branche: basePitch.content_examples_branche,
    case_studies_keys: matched.map((c) => c.key),
    vorgehen_blocks: basePitch.vorgehen_blocks,
    cta_headline: basePitch.cta_headline,
    cta_text: basePitch.cta_text,
    company_name_display: basePitch.company_name_display,
    published_at: null,
    platforms: basePitch.platforms,
    platform_strategy: basePitch.platform_strategy,
    lead_type: basePitch.lead_type,
    third_card_type: basePitch.third_card_type,
  });

  const published = await updatePitchPage(created.id, {
    status: "published",
    published_at: now,
  });

  return { slug: published.slug, url: buildPitchUrl(published.slug) };
}

function buttonHtml(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0;">
    <tr><td>
      <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;background-color:${BRAND_GRADIENT_START};background-image:${BRAND_GRADIENT};color:${BRAND_GRADIENT_TEXT};font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

async function run() {
  log("=== Drei-Landingpages-Test ===");
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as { leadId?: string };
  if (!state.leadId) throw new Error("Kein leadId in State");

  const { data } = await getClient().from("primesocial_leads").select("*").eq("id", state.leadId).single();
  const lead = data as Lead;
  log(`Lead: ${lead.company_name}`);

  const basePitch = await getPitchPageByLeadId(lead.id);
  if (!basePitch) throw new Error("Keine bestehende Pitch-Seite für den Lead — erst regulär generieren");
  log(`Basis-Pitch: ${basePitch.slug} (focus=${basePitch.focus_area})`);

  const results: { focus: PitchFocusArea; url: string }[] = [];
  for (const focus of ["recruiting", "organic", "meta_ads"] as PitchFocusArea[]) {
    log(`Klone für Fokus "${focus}"…`);
    const { slug, url } = await clonePitchForFocus(basePitch, lead, focus);
    log(`  → ${url}`);
    results.push({ focus, url });
  }

  // Mail bauen
  const buttonsHtml = results
    .map((r) => `
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">
        ${FOCUS_LABELS[r.focus]}
      </p>
      ${buttonHtml(`Landing-Page öffnen`, r.url)}
    `)
    .join("");

  const intro = `
    <p style="margin:0 0 24px;font-size:15px;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;">
      Drei Landing-Page-Versionen für ${lead.company_name} (Test-Lead). Alle drei zeigen denselben Content,
      aber mit unterschiedlichen Case-Studies je nach Fokus-Bereich.
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
    `Drei Landing-Page-Versionen für ${lead.company_name}:\n\n` +
    results.map((r) => `${FOCUS_LABELS[r.focus]}: ${r.url}`).join("\n");

  const subject = "[Testrun] 3 Landing-Pages zum Vergleich";

  // DB-Eintrag (für Tracking-Pixel)
  const record = await saveEmailSent({
    lead_id: lead.id,
    step_number: 0,
    step_name: "three-landingpages-test",
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
  for (const r of results) log(`   ${FOCUS_LABELS[r.focus]}: ${r.url}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
