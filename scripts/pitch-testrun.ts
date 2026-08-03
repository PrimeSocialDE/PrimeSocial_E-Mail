/**
 * Testrun: Komplette finale Mail-Sequenz mit Pitch-Link-Integration
 * an niklas@primesocial.de, 5-Minuten-Abstand.
 *
 * Ausführen: npx tsx scripts/pitch-testrun.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";

import { getClient, createLead, updateLead, getPitchPageByLeadId, createPitchPage, updatePitchPage, saveEmailSent } from "../lib/supabase";
import { generateOpener, generateFollowUp, generatePitchPageContent } from "../lib/anthropic";
import { WORKFLOW_STEPS } from "../types";
import type { Lead, InstagramData } from "../types";
import { sendTemplateEmail, textToHtml } from "../lib/brevo";
import { generatePitchSlug, matchCaseStudies, buildPitchUrl, CONTACT } from "../lib/pitch-constants";

const RECIPIENT = "niklas@primesocial.de";
const RECIPIENT_NAME = "Niklas";
const INTERVAL_MS = 5 * 60 * 1000; // 5 Minuten

const LEAD_STATE_FILE = path.join(process.cwd(), "scripts", ".pitch-testrun-state.json");

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────
// Realistischer Test-Lead: Handwerksbetrieb mit Recruiting-Fokus
// ─────────────────────────────────────────────────────────────────
function buildMockInstagramData(): InstagramData {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    username: "schreinerei.bergmann",
    fullName: "Schreinerei Bergmann",
    biography: "Familiengeführte Schreinerei in Bremen seit 1968 🪚 Innenausbau · Küchen · Möbel",
    followersCount: 1180,
    followsCount: 342,
    postsCount: 87,
    isVerified: false,
    externalUrl: "https://schreinerei-bergmann.example",
    latestPosts: [
      { timestamp: new Date(now - 3 * day).toISOString(),  type: "video", videoViewCount: 380, likesCount: 24, caption: "Neue Küche in Findorff fertig eingebaut. Massive Eiche geölt, grifflose Fronten." },
      { timestamp: new Date(now - 8 * day).toISOString(),  type: "image", likesCount: 41, caption: "Morgens in der Werkstatt. Sägemehl ist unser Parfüm." },
      { timestamp: new Date(now - 12 * day).toISOString(), type: "video", videoViewCount: 220, likesCount: 18, caption: "Maßgefertigter Einbauschrank, 4,2 Meter Länge. 70 Arbeitsstunden." },
      { timestamp: new Date(now - 16 * day).toISOString(), type: "image", likesCount: 34, caption: "Unser neuer Auszubildender Tim im ersten Monat." },
      { timestamp: new Date(now - 21 * day).toISOString(), type: "video", videoViewCount: 290, likesCount: 22 },
      { timestamp: new Date(now - 26 * day).toISOString(), type: "image", likesCount: 28 },
      { timestamp: new Date(now - 31 * day).toISOString(), type: "video", videoViewCount: 340, likesCount: 26 },
      { timestamp: new Date(now - 37 * day).toISOString(), type: "image", likesCount: 37 },
      { timestamp: new Date(now - 42 * day).toISOString(), type: "video", videoViewCount: 410, likesCount: 31, caption: "Zeitraffer: vom Rohbrett bis zur fertigen Küchenfront." },
    ],
    scrapedAt: new Date().toISOString(),
  };
}

const MOCK_LEAD: Omit<Lead, "id" | "created_at" | "updated_at"> = {
  company_name: "Schreinerei Bergmann GmbH",
  contact_name: "Markus Bergmann",
  contact_first_name: "Markus",
  contact_last_name: "Bergmann",
  email: `testrun-${Date.now()}@example.invalid`, // nicht echter Empfänger
  private_email: null,
  city: "Bremen",
  website_url: "https://schreinerei-bergmann.example",
  website_summary: "Schreinerei Bergmann ist ein familiengeführter Handwerksbetrieb in Bremen, gegründet 1968. 18 Mitarbeiter, spezialisiert auf Innenausbau, maßgefertigte Küchen und Möbel für private und gewerbliche Auftraggeber. Eigene Werkstatt mit modernen CNC-Maschinen und traditioneller Holzverarbeitung. Im Karriere-Bereich der Website sind zwei offene Gesellen-Stellen sowie ein Ausbildungsplatz zum Tischler ausgeschrieben. Der Betrieb legt Wert auf langfristige Zusammenarbeit mit Kunden und Mitarbeitern.",
  instagram_handle: "schreinerei.bergmann",
  instagram_data: buildMockInstagramData(),
  instagram_problem: null,
  segment: "WENIGREICHWEITE",
  segment_reasoning: "Regelmäßiges Posting, aber Videos erreichen durchschnittlich nur 300-400 Views bei 1.180 Followern. Hauptproblem liegt im Einstieg der Posts.",
  workflow_step: 0,
  workflow_started_at: null,
  next_touchpoint_at: null,
  status: "active",
  pitch_page_id: null,
  pitch_page_url: null,
  pitch_lead_type: null,
  pause_reason: null,
  last_scraped_at: null,
  last_meta_ads_check_at: null,
  meta_ads_signal: null,
  newsletter_subscribed_at: null,
};

// ─────────────────────────────────────────────────────────────────
// State-Persistenz — Lead-ID und Pitch-URL zwischen Runs
// ─────────────────────────────────────────────────────────────────
interface TestrunState {
  leadId?: string;
  pitchPageId?: string;
  slug?: string;
  pitchUrl?: string;
  sentSteps?: number[];
  subjects?: string[];
}

function loadState(): TestrunState {
  try {
    return JSON.parse(fs.readFileSync(LEAD_STATE_FILE, "utf-8")) as TestrunState;
  } catch {
    return {};
  }
}

function saveState(state: TestrunState) {
  fs.writeFileSync(LEAD_STATE_FILE, JSON.stringify(state, null, 2));
}

// ─────────────────────────────────────────────────────────────────
// Schritt 1: Lead in DB anlegen (oder vorhandenen wiederverwenden)
// ─────────────────────────────────────────────────────────────────
async function ensureLead(state: TestrunState): Promise<Lead> {
  if (state.leadId) {
    const { data } = await getClient().from("primesocial_leads").select("*").eq("id", state.leadId).single();
    if (data) {
      log(`Lead aus State wiederverwendet: ${state.leadId}`);
      return data as Lead;
    }
  }
  log(`Lege neuen Test-Lead an: ${MOCK_LEAD.company_name}`);
  const created = await createLead(MOCK_LEAD);
  state.leadId = created.id;
  saveState(state);
  return created;
}

// ─────────────────────────────────────────────────────────────────
// Schritt 2: Pitch-Page generieren und veröffentlichen
// ─────────────────────────────────────────────────────────────────
async function ensurePitch(lead: Lead, state: TestrunState): Promise<{ slug: string; url: string }> {
  if (state.slug && state.pitchUrl) {
    log(`Pitch aus State: ${state.slug}`);
    return { slug: state.slug, url: state.pitchUrl };
  }
  const existing = await getPitchPageByLeadId(lead.id);
  if (existing && existing.status === "published") {
    const url = buildPitchUrl(existing.slug);
    state.slug = existing.slug;
    state.pitchPageId = existing.id;
    state.pitchUrl = url;
    saveState(state);
    log(`Bestehende Pitch-Seite wiederverwendet: ${existing.slug}`);
    return { slug: existing.slug, url };
  }

  log(`Generiere Pitch-Inhalt via Claude...`);
  const content = await generatePitchPageContent(lead);
  log(`Claude-Output: focus_area=${content.focus_area}, reasoning="${content.focus_reasoning.slice(0, 100)}..."`);

  const brancheHint = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
  const matched = matchCaseStudies(content.focus_area, brancheHint);

  const slug = generatePitchSlug(lead.company_name);
  const pitch = await createPitchPage({
    lead_id: lead.id,
    slug,
    status: "draft",
    focus_area: content.focus_area,
    focus_reasoning: content.focus_reasoning,
    hero_headline: content.hero_headline,
    hero_subline_accent: content.hero_subline_accent,
    hero_text: content.hero_text,
    hero_meta: content.hero_meta,
    konzept_blocks: content.konzept_blocks,
    content_strategie_blocks: content.content_strategie_blocks ?? null,
    content_examples_branche: brancheHint || null,
    case_studies_keys: matched.map((c) => c.key),
    vorgehen_blocks: content.vorgehen_blocks,
    cta_headline: content.cta_headline,
    cta_text: content.cta_text,
    company_name_display: lead.company_name,
    published_at: null,
    platforms: content.platforms,
    platform_strategy: content.platform_strategy,
    lead_type: content.lead_type,
    third_card_type: content.third_card_type,
  });

  const now = new Date().toISOString();
  const published = await updatePitchPage(pitch.id, { status: "published", published_at: now });
  const url = buildPitchUrl(published.slug);

  await updateLead(lead.id, { pitch_page_id: published.id, pitch_page_url: url });

  state.slug = published.slug;
  state.pitchPageId = published.id;
  state.pitchUrl = url;
  saveState(state);
  log(`Pitch veröffentlicht: ${url}`);
  return { slug: published.slug, url };
}

// ─────────────────────────────────────────────────────────────────
// Mail-Templates — finale Version für Testrun
// Platzhalter: {firstName}, {pitchUrl}
// ─────────────────────────────────────────────────────────────────
// Button-Platzhalter — wird in brevo.ts zu einem HTML-Button (Plain-Text: "Label: URL")
const BTN = "{{PITCH_BUTTON}}";

function step3Konzept(firstName: string): string {
  // Step 3: Pitch-Link als Hauptinhalt. Button steht mittig im Body.
  return `Moin ${firstName},

ich hab mich diese Woche nochmal mit eurem Instagram und eurer Website beschäftigt. Was mir dabei gekommen ist, hab ich nicht in eine lange Mail gepackt, sondern auf eine eigene Seite.

Da steht in einem Aufwasch drin wie eine Content-Strategie für Schreinerei Bergmann aussehen würde, welche Formate für euch funktionieren und wie der Ablauf von Tag eins bis zum ersten Post wäre.

${BTN}

Schau es dir an wenn du fünf Minuten hast. Wenn etwas nicht passt, sag Bescheid, dann passen wir das an.

Viele Grüße aus Oldenburg
Niklas`;
}

function step4Recap(firstName: string): { subject: string; body: string } {
  return {
    subject: "Kurze Rückmeldung",
    body: `Hallo ${firstName},

falls du letzte Woche noch nicht reingeschaut hast, hier nochmal das Konzept das ich für euch aufgeschrieben hab.

${BTN}

Es muss kein Termin draus werden, ein kurzer Satz zurück reicht mir auch. Ob das grundsätzlich in eure Richtung geht oder ob ich am Thema vorbei bin. Beides ist völlig okay.

Viele Grüße aus Oldenburg
Niklas`,
  };
}

function step5Gespraech(firstName: string): { subject: string; body: string } {
  return {
    subject: "15 Minuten",
    body: `Moin ${firstName},

ich würde das Konzept gerne mal mit dir durchgehen. 15 Minuten reichen dafür völlig. Wir können dann zusammen schauen ob die Richtung stimmt und was davon für euch Sinn ergibt.

Hättest du diese oder nächste Woche Zeit? Ich richte mich nach euch.

${BTN}

Viele Grüße aus Oldenburg
Niklas`,
  };
}

function step6LetzterImpuls(firstName: string): { subject: string; body: string } {
  return {
    subject: "Wer euch auf Instagram findet",
    body: `${firstName},

der Hauptgrund warum ich mich überhaupt gemeldet habe: Eure Arbeit ist richtig gut. Das sieht man an den Projekten die ihr postet. Nur kommt bei den meisten Leuten davon zu wenig an.

Das ist kein Aufwand-Thema und keine Frage wie viel man investiert. Es geht eher darum wie ein Post die ersten Sekunden wirkt.

${BTN}

Viele Grüße aus Oldenburg
Niklas`,
  };
}

function step7Breakup(firstName: string): { subject: string; body: string } {
  return {
    subject: "Kurze Info",
    body: `Moin ${firstName},

das Thema hat bei euch gerade offenbar keine Priorität. Völlig nachvollziehbar, im Handwerk ist das Tagesgeschäft oft voll genug.

Ich halte mich jetzt erstmal raus und melde mich nicht weiter. Falls es irgendwann doch passt, schreib einfach kurz. Ich freu mich dann drauf.

Alles Gute!
Niklas`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Mail senden + DB-Eintrag
// ─────────────────────────────────────────────────────────────────
async function sendStep(
  stepNumber: number,
  stepName: string,
  lead: Lead,
  subject: string,
  bodyText: string,
  pdfUrl: string | null,
  ctaButton: { label: string; url: string } | null,
) {
  const prefixedSubject = `[Testrun ${stepNumber}/7] ${subject}`;

  const record = await saveEmailSent({
    lead_id: lead.id,
    step_number: stepNumber,
    step_name: stepName,
    subject: prefixedSubject,
    body_html: textToHtml(bodyText),
    body_text: bodyText,
    pdf_url: pdfUrl,
    brevo_message_id: null,
    sent_to_email: RECIPIENT,
    sent_at: new Date().toISOString(),
    opened_at: null,
    clicked_at: null,
    bounced: false,
  });

  const result = await sendTemplateEmail({
    to: { email: RECIPIENT, name: RECIPIENT_NAME },
    subject: prefixedSubject,
    bodyText,
    pdfUrl: pdfUrl ?? undefined,
    pdfName: pdfUrl ? `PrimeSocial-Analyse-Schreinerei-Bergmann.pdf` : undefined,
    trackingId: record.id,
    ctaButton: ctaButton ?? undefined,
  });
  log(`   ✉️  Gesendet (Brevo-ID: ${result.messageId ?? "?"})`);
}

// ─────────────────────────────────────────────────────────────────
// Haupt-Flow
// ─────────────────────────────────────────────────────────────────
async function run() {
  log(`=== Pitch-Testrun Start ===`);
  log(`Empfänger: ${RECIPIENT}, Abstand: 5 Min`);

  const state = loadState();
  const lead = await ensureLead(state);
  const { slug, url: pitchUrl } = await ensurePitch(lead, state);
  log(`Pitch-URL: ${pitchUrl}  (lokal: http://localhost:3000/p/${slug})`);

  const firstName = lead.contact_first_name ?? lead.company_name;
  const sent = new Set(state.sentSteps ?? []);
  const subjects: string[] = state.subjects ?? [];

  for (const step of WORKFLOW_STEPS) {
    if (sent.has(step.step)) {
      log(`⏭️  Step ${step.step} bereits gesendet`);
      continue;
    }

    log(`\n▶ Step ${step.step}: ${step.name}`);
    let subject = "";
    let bodyText = "";
    let pdfUrl: string | null = null;
    let ctaButton: { label: string; url: string } | null = null;

    try {
      if (step.step === 1) {
        log(`   Generiere Opener via Claude…`);
        const opener = await generateOpener(lead);
        subject = opener.subject;
        bodyText = opener.body;
        try {
          const { generatePdf } = await import("../lib/pdfendpoint");
          log(`   Generiere PDF…`);
          pdfUrl = await generatePdf(lead, {
            pdf_start: opener.pdf_start,
            pdf_problem: opener.pdf_problem,
            "pdf_lösung": opener["pdf_lösung"],
          });
          log(`   PDF: ${pdfUrl}`);
        } catch (pdfErr) {
          log(`   ⚠️ PDF fehlgeschlagen: ${String(pdfErr)}`);
        }
      } else if (step.step === 2) {
        log(`   Generiere Follow-Up via Claude…`);
        const gen = await generateFollowUp(lead, 2, subjects);
        subject = gen.subject;
        bodyText = gen.body;
      } else if (step.step === 3) {
        subject = "Kurzes Konzept für euch";
        bodyText = step3Konzept(firstName);
        ctaButton = { label: "Konzept ansehen", url: pitchUrl };
      } else if (step.step === 4) {
        const t = step4Recap(firstName);
        subject = t.subject;
        bodyText = t.body;
        ctaButton = { label: "Konzept öffnen", url: pitchUrl };
      } else if (step.step === 5) {
        const t = step5Gespraech(firstName);
        subject = t.subject;
        bodyText = t.body;
        ctaButton = { label: "Konzept nochmal ansehen", url: pitchUrl };
      } else if (step.step === 6) {
        const t = step6LetzterImpuls(firstName);
        subject = t.subject;
        bodyText = t.body;
        ctaButton = { label: "Was das konkret heißt", url: pitchUrl };
      } else if (step.step === 7) {
        const t = step7Breakup(firstName);
        subject = t.subject;
        bodyText = t.body;
      }
    } catch (err) {
      log(`   ❌ Fehler bei Generierung: ${String(err)}`);
      throw err;
    }

    subjects.push(subject);
    log(`   Betreff: ${subject}`);

    await sendStep(step.step, step.stepName, lead, subject, bodyText, pdfUrl, ctaButton);

    sent.add(step.step);
    state.sentSteps = Array.from(sent);
    state.subjects = subjects;
    saveState(state);

    if (step.step < 7) {
      log(`   ⏰ Warte 5 Minuten bis Step ${step.step + 1}…`);
      await sleep(INTERVAL_MS);
    }
  }

  log(`\n=== Testrun abgeschlossen ===`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
