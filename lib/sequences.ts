/**
 * sequences.ts
 * Orchestriert die Vorberechnung und den automatischen Versand aller E-Mail-Sequenzen.
 *
 * Workflow:
 * 1. generateAndSaveAllDrafts(lead) → generiert alle 5 Mails (Steps 1-3 Claude, 4-5 Template) und speichert sie
 * 2. cron/daily ruft sendDueDrafts() → holt pending Drafts, sendet via Brevo-Template
 */

import type { Lead, EmailDraft, Segment } from "@/types";
import { WORKFLOW_STEPS } from "@/types";
import { generateLeadEmails, determineLeadType, sanitizeSubject, generatePitchPageContent } from "@/lib/anthropic";
import { getStepTemplate, MAIL_ELIGIBLE_SEGMENTS } from "@/lib/segments";
import { generatePitchSlug, matchCaseStudies, buildPitchUrl } from "@/lib/pitch-constants";
import {
  deleteDraftsForLead,
  saveDraft,
  updateDraft,
  getPendingDrafts,
  saveEmailSent,
  updateEmailSent,
  updateLead,
  getLead,
  getEmailsForLead,
  addSubscriber,
  getPitchPageByLeadId,
  createPitchPage,
  updatePitchPage,
} from "@/lib/supabase";

// Status-Liste: bei diesen Status werden KEINE Mails gesendet
const STOP_STATUSES = ["unsubscribed", "bounced", "paused", "replied", "converted"];

// ─────────────────────────────────────────────────────────────────
// Alle Sequenz-Entwürfe für einen Lead generieren
// ─────────────────────────────────────────────────────────────────
/**
 * Bestimmt die Versand-E-Mail: private_email hat Priorität, dann email.
 * Gibt null zurück wenn keine E-Mail vorhanden → Lead wird übersprungen.
 */
function getRecipientEmail(lead: Lead): string | null {
  return lead.private_email || lead.email || null;
}

export async function generateAndSaveAllDrafts(lead: Lead): Promise<EmailDraft[]> {
  // ── VORAUSSETZUNGS-GATE ──
  // Mails werden nur dann (alle 5 in einem Claude-Call) generiert, wenn ALLE
  // Voraussetzungen erfüllt sind. Damit ist sichergestellt, dass Claude die
  // Sequenz konsistent erstellt und die golden rules eingehalten werden.
  // Reihenfolge bewusst: günstigste Checks zuerst.

  // 1. Eligible Segment? (KEINEVIDEO / INKONSISTENT / SOLIDE)
  if (!lead.segment || !MAIL_ELIGIBLE_SEGMENTS.includes(lead.segment as Segment)) {
    console.warn(`[sequences] Lead ${lead.id} (${lead.company_name}): Segment "${lead.segment}" nicht mail-eligible → übersprungen`);
    return [];
  }

  // 2. E-Mail-Empfänger vorhanden?
  const recipientEmail = getRecipientEmail(lead);
  if (!recipientEmail) {
    console.warn(`[sequences] Lead ${lead.id} (${lead.company_name}): Keine E-Mail → übersprungen`);
    return [];
  }

  // 3. Vorname vorhanden? (Goldene Regel: niemals {firstName}-Platzhalter im Versand)
  // Wir nehmen nur den ERSTEN Teil bei Doppelnamen (Philipp-Mark → Philipp,
  // Anna Maria → Anna). Klingt natürlicher in Anreden als der volle Doppelname.
  const firstNameRaw = (lead.contact_first_name ?? "").trim();
  const firstName = firstNameRaw.split(/[-\s]/)[0];
  if (!firstName) {
    console.warn(`[sequences] Lead ${lead.id} (${lead.company_name}): Kein contact_first_name → übersprungen (Mails 4/5 würden {firstName}-Platzhalter zeigen)`);
    return [];
  }

  // 4. Website-Summary vorhanden? (Branche-Erkennung + Pain-Abwägung)
  if (!lead.website_summary || !lead.website_summary.trim()) {
    console.warn(`[sequences] Lead ${lead.id} (${lead.company_name}): Kein website_summary → übersprungen (verhindert generische Mails ohne Branchenschärfe)`);
    return [];
  }

  // 5. Instagram-Daten vorhanden? (Posting-Pattern, Bio, Performance)
  if (!lead.instagram_data || !lead.instagram_data.latestPosts) {
    console.warn(`[sequences] Lead ${lead.id} (${lead.company_name}): Keine instagram_data → übersprungen (verhindert Mail 1 ohne Plattform-Fakten)`);
    return [];
  }

  // 6. Lead-Type vorhanden? Sonst jetzt bestimmen und speichern.
  //    Damit hat das PDF (Slide-1-Grafik, Pain-Cards, Case-Study) von Anfang an
  //    den richtigen Lead-Type — keine Recruiting-Defaults mehr für Leadgen/Branding-Leads.
  if (!lead.pitch_lead_type) {
    try {
      const { lead_type, reasoning } = await determineLeadType(lead);
      const updated = await updateLead(lead.id, { pitch_lead_type: lead_type });
      lead = updated; // Lokales Lead-Objekt aktualisieren, damit generateLeadEmails den Type sieht
      console.log(`[sequences] Lead ${lead.id} (${lead.company_name}): lead_type=${lead_type} (${reasoning})`);
    } catch (err) {
      console.error(`[sequences] determineLeadType fehlgeschlagen für Lead ${lead.id}:`, err);
      return [];
    }
  }

  // 7. Pitch-Page automatisch erstellen + publishen.
  //    Mail 3 braucht den Link — ohne Pitch-Page würde der Versand
  //    übersprungen. Wir generieren also direkt hier zusammen mit den Mails.
  //    Bei Fehler: log + weiter (Mail 1, 2, 4, 5 gehen trotzdem raus, Mail 3
  //    wird beim Versand übersprungen).
  try {
    const existing = await getPitchPageByLeadId(lead.id);
    if (!existing) {
      const content = await generatePitchPageContent(lead, {
        forceLeadType: lead.pitch_lead_type ?? undefined,
      });
      const brancheHint = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
      const matchedCases = matchCaseStudies(content.focus_area, brancheHint);
      const url = (slug: string) => buildPitchUrl(slug);
      const slug = generatePitchSlug(lead.company_name);
      const pitch = await createPitchPage({
        lead_id:                  lead.id,
        slug,
        focus_area:               content.focus_area,
        focus_reasoning:          content.focus_reasoning,
        lead_type:                content.lead_type,
        third_card_type:          content.third_card_type,
        platforms:                content.platforms,
        platform_strategy:        content.platform_strategy,
        hero_headline:            content.hero_headline,
        hero_subline_accent:      content.hero_subline_accent,
        hero_text:                content.hero_text,
        hero_meta:                content.hero_meta,
        konzept_blocks:           content.konzept_blocks,
        content_strategie_blocks: null,
        content_examples_branche: brancheHint || null,
        case_studies_keys:        matchedCases.map((c) => c.key),
        vorgehen_blocks:          content.vorgehen_blocks,
        cta_headline:             content.cta_headline,
        cta_text:                 content.cta_text,
        company_name_display:     lead.company_name,
        status:                   "published",
        published_at:             new Date().toISOString(),
      });
      // Denormalisieren auf Lead, damit Mail 3 die URL ohne Re-Query findet
      await updateLead(lead.id, {
        pitch_page_id:  pitch.id,
        pitch_page_url: url(pitch.slug),
      });
      console.log(`[sequences] Lead ${lead.id} (${lead.company_name}): Pitch-Page automatisch erstellt → ${url(pitch.slug)}`);
    } else if (existing.status !== "published") {
      // Bestehender Draft → einfach publishen
      await updatePitchPage(existing.id, {
        status: "published",
        published_at: existing.published_at ?? new Date().toISOString(),
      });
      console.log(`[sequences] Lead ${lead.id} (${lead.company_name}): bestehende Pitch-Page publiziert`);
    }
  } catch (err) {
    // Mails sollen trotzdem gehen — Mail 3 würde halt beim Versand skipped
    console.error(`[sequences] Pitch-Page-Generation fehlgeschlagen für Lead ${lead.id} (Mails gehen trotzdem):`, err);
  }

  // Duplikat-Schutz: Hat der Lead schon E-Mails erhalten?
  const existingEmails = await getEmailsForLead(lead.id);
  if (existingEmails.length > 0) {
    console.warn(`[sequences] Lead ${lead.id} (${lead.company_name}): Bereits ${existingEmails.length} Mails gesendet → keine neuen Drafts`);
    return [];
  }

  // Bestehende pending Drafts löschen (bei Neuberechnung)
  await deleteDraftsForLead(lead.id);

  const startedAt = lead.workflow_started_at
    ? new Date(lead.workflow_started_at)
    : new Date();

  // v3: 1 Claude-Call generiert Mail 1, 2, 3 + Slide 1 in einem JSON.
  let claudeMails: Awaited<ReturnType<typeof generateLeadEmails>> | null = null;
  try {
    claudeMails = await generateLeadEmails(lead);
  } catch (err) {
    console.error(`[sequences] generateLeadEmails fehlgeschlagen für Lead ${lead.id}:`, err);
    // Fail-Fast: ohne Claude-Output keine Drafts speichern. sendDueDrafts würde
    // sonst leere Mails versenden.
    return [];
  }

  // Begrüßungs-Sicherheitsnetz: Claude lässt manchmal die Anrede weg, obwohl
  // sie im Prompt Pflicht ist. Wir prüfen jeden Body und bauen die Begrüßung
  // davor, falls sie fehlt. Das ist die letzte Sicherung — kein Versand ohne Anrede.
  const greetingPrefixIfMissing = (body: string, salutation: "Moin" | "Hallo"): string => {
    const trimmed = body.trimStart();
    if (/^(Moin|Hallo|Hi|Hey|Guten Tag)\s/i.test(trimmed)) return body; // schon vorhanden
    return `${salutation} ${firstName},\n\n${trimmed}`;
  };
  claudeMails.mail_1.body = greetingPrefixIfMissing(claudeMails.mail_1.body, "Moin");
  claudeMails.mail_2.body = greetingPrefixIfMissing(claudeMails.mail_2.body, "Hallo");
  claudeMails.mail_3.body = greetingPrefixIfMissing(claudeMails.mail_3.body, "Moin");

  const drafts: EmailDraft[] = [];

  for (const step of WORKFLOW_STEPS) {
    const scheduledFor = new Date(startedAt);
    scheduledFor.setDate(scheduledFor.getDate() + step.day);
    // Auf 00:00 Uhr normalisieren, damit der Cron am Fälligkeits-Tag den
    // Draft garantiert findet (auch wenn er um 09:00 läuft und der Lead
    // ursprünglich um 11:00 aktiviert wurde).
    scheduledFor.setHours(0, 0, 0, 0);

    let subject = "";
    let bodyText = "";
    let pdfContent: EmailDraft["pdf_content"] = null;

    try {
      if (step.step === 1) {
        subject = sanitizeSubject(claudeMails.mail_1.subject);
        bodyText = claudeMails.mail_1.body;
        pdfContent = {
          headline:       claudeMails.slide_1.headline,
          subline:        claudeMails.slide_1.subline,
          body_text:      claudeMails.slide_1.body_text,
          key_statement:  claudeMails.slide_1.key_statement,
          our_approach:   claudeMails.slide_1.our_approach,
          case_study_key: claudeMails.slide_1.case_study_key,
          slide_2_pains:  claudeMails.slide_2_pains,
        };
      } else if (step.step === 2) {
        subject = sanitizeSubject(claudeMails.mail_2.subject);
        bodyText = claudeMails.mail_2.body;
      } else if (step.step === 3) {
        subject = sanitizeSubject(claudeMails.mail_3.subject);
        bodyText = claudeMails.mail_3.body;
      } else if (step.type === "template") {
        // Steps 4 + 5: Feste Templates (Mail 4 mit {{CALENDLY_BUTTON}}, Mail 5 = Breakup)
        // firstName ist garantiert non-empty wegen Voraussetzungs-Gate oben.
        const segment = lead.segment ?? "INKONSISTENT";
        const tpl = getStepTemplate(step.step, segment, firstName);
        if (!tpl) {
          // Sollte nach Gate nicht mehr passieren — wenn doch: kein Draft, kein
          // {firstName}-Versand. Lieber Step skippen als Mist rausjagen.
          console.error(`[sequences] Lead ${lead.id} Step ${step.step}: Template-Aufloesung fehlgeschlagen → Draft uebersprungen`);
          continue;
        }
        subject  = tpl.subject;
        bodyText = tpl.body;
      }
    } catch (err) {
      console.error(`[sequences] Fehler bei Step ${step.step} für Lead ${lead.id}:`, err);
      subject  = `[Generierungsfehler Step ${step.step}]`;
      bodyText = String(err);
    }

    const draft = await saveDraft({
      lead_id:      lead.id,
      step_number:  step.step,
      step_name:    step.name,
      subject,
      body_text:    bodyText,
      pdf_content:  pdfContent,
      pdf_url:      null,
      status:       "pending",
      scheduled_for: scheduledFor.toISOString(),
      sent_at:      null,
      pdf_attempts: 0,
      error_reason: null,
    });

    drafts.push(draft);
  }

  return drafts;
}

// ─────────────────────────────────────────────────────────────────
// Fällige Drafts versenden (vom Cron-Job aufgerufen)
// ─────────────────────────────────────────────────────────────────
export async function sendDueDrafts(
  maxMails = 50,
  options: { onlyLeadId?: string; skipTimeWindow?: boolean } = {}
): Promise<{ sent: number; errors: string[] }> {
  // ── Regel: Nur zwischen 8:00 und 18:00 Uhr (deutsche Zeit) senden ──
  // skipTimeWindow ist ausschließlich für Live-Tests (scripts/test-run.ts) gedacht.
  // Sommerzeit-sicher: Intl mit Europe/Berlin holt die korrekte lokale Stunde,
  // egal ob CET (UTC+1) oder CEST (UTC+2) aktiv ist.
  if (!options.skipTimeWindow) {
    const germanHour = parseInt(
      new Intl.DateTimeFormat("de-DE", {
        timeZone: "Europe/Berlin",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
      10,
    );
    if (germanHour < 8 || germanHour >= 18) {
      return { sent: 0, errors: [`Außerhalb der Sendezeit (${germanHour}:00 dt. Zeit, erlaubt: 8-18 Uhr)`] };
    }
  }

  // Sonntag = Ruhetag für Erst-Ansprachen. Mail-1-Opener werden Sonntags NICHT
  // versendet (bleiben pending, gehen Montag raus). Follow-Up-Mails 2-5 gehen
  // weiter raus, weil der Lead uns dort schon kennt.
  const berlinDay = new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin", weekday: "short" });
  const isSunday = berlinDay === "Sun";

  const all = await getPendingDrafts();
  const filtered = options.onlyLeadId
    ? all.filter((d) => d.lead_id === options.onlyLeadId)
    : all;
  const pending = filtered.slice(0, maxMails);

  let sent = 0;
  const errors: string[] = [];

  for (const draft of pending) {
    try {
      // Sonntag: Mail-1-Opener nicht versenden (Erst-Ansprache am Ruhetag wirkt aufdringlich).
      // Draft bleibt pending → Montag erneut versucht. Mail 2-5 dürfen Sonntags raus.
      if (isSunday && draft.step_number === 1) {
        continue;
      }

      const lead = await getLead(draft.lead_id);

      // ── Regel: Geantwortet / Unsubscribed / Bounced / Pausiert / Konvertiert → STOP ──
      if (STOP_STATUSES.includes(lead.status)) {
        await updateDraft(draft.id, { status: "skipped" });
        continue;
      }

      // ── Regel: KEININSTAGRAM → keine Mails ──
      if (lead.segment === "KEININSTAGRAM" || lead.segment === "KEINFIT" || lead.segment === "SOLIDE") {
        await updateDraft(draft.id, { status: "skipped" });
        continue;
      }

      // ── Regel: Keine E-Mail-Adresse → skip ──
      const recipientEmail = getRecipientEmail(lead);
      if (!recipientEmail) {
        await updateDraft(draft.id, { status: "skipped" });
        errors.push(`Draft ${draft.id}: Keine E-Mail für ${lead.company_name}`);
        continue;
      }

      // ── Regel: Duplikat-Schutz — gleichen Step nicht doppelt senden ──
      const existingEmails = await getEmailsForLead(lead.id);
      if (existingEmails.some((e) => e.step_number === draft.step_number)) {
        await updateDraft(draft.id, { status: "skipped" });
        continue;
      }

      // E-Mail-Verifizierung deaktiviert — Hunter-Credits sparen, Bounces
      // werden vom Brevo-Webhook getrackt (hard_bounce → status='bounced').

      const bodyText = draft.body_text;

      // Sicherheitscheck 1: Keine sichtbaren Platzhalter in KEINER Mail
      if (/\[PLATZHALTER/i.test(bodyText)) {
        errors.push(`Draft ${draft.id}: Platzhalter in Mail erkannt — übersprungen`);
        continue;
      }
      // Sicherheitscheck 2: Unaufgelöste {token}-Platzhalter im Subject (z.B. {firstName})
      // — kommt nur vor wenn getStepTemplate nicht ersetzt oder Claude einen Platzhalter
      // generiert hat. Niemals durchschlüpfen lassen.
      if (/\{[^{}]+\}/.test(draft.subject)) {
        errors.push(`Draft ${draft.id}: Unaufgelöster Platzhalter im Subject "${draft.subject}" — übersprungen`);
        await updateDraft(draft.id, { status: "skipped" });
        continue;
      }
      // Sicherheitscheck 3: Unaufgelöste {firstName}-style Token im Body (echte Button-Tokens
      // {{PITCH_BUTTON}} / {{CALENDLY_BUTTON}} sind doppelt geklammert und werden hier nicht erfasst).
      if (/(?<!\{)\{[a-zA-Z][^{}]*\}(?!\})/.test(bodyText)) {
        errors.push(`Draft ${draft.id}: Unaufgelöster Platzhalter im Body — übersprungen`);
        await updateDraft(draft.id, { status: "skipped" });
        continue;
      }

      // ── Buttons je Step auflösen ──
      // Mail 3 ({{PITCH_BUTTON}}) braucht die Pitch-Seite des Leads. Wenn keine
      // existiert, Mail abbrechen — der Button ist die einzige CTA.
      // Mail 4 ({{CALENDLY_BUTTON}}) zeigt auf den Calendly-Buchungslink.
      let pitchButton: { label: string; url: string } | undefined;
      let calendlyButton: { label: string; url: string } | undefined;

      if (draft.step_number === 3) {
        const { getPitchPageByLeadId } = await import("@/lib/supabase");
        const { buildPitchUrl } = await import("@/lib/pitch-constants");
        const pitchPage = await getPitchPageByLeadId(lead.id);
        if (!pitchPage?.slug) {
          errors.push(`Draft ${draft.id}: Mail 3 ohne Pitch-Page — übersprungen (${lead.company_name})`);
          continue;
        }
        pitchButton = { label: "Vorschläge ansehen", url: buildPitchUrl(pitchPage.slug) };
      }

      if (draft.step_number === 4) {
        const { CALENDLY_URL } = await import("@/lib/pitch-constants");
        const calendlyUrl = process.env.CALENDLY_URL ?? CALENDLY_URL;
        calendlyButton = { label: "15-Minuten-Slot wählen", url: calendlyUrl };
      }

      // PDF für Step 1 generieren (serverseitig via @react-pdf/renderer)
      // ── Step 1: PDF ist PFLICHT — ohne PDF wird nicht gesendet ──
      let pdfBuffer: Buffer | undefined;
      let pdfName: string | undefined;
      if (draft.step_number === 1) {
        if (!draft.pdf_content) {
          await updateDraft(draft.id, { status: "failed", error_reason: "Step 1 ohne pdf_content" });
          errors.push(`Draft ${draft.id}: Step 1 ohne pdf_content → failed (${lead.company_name})`);
          continue;
        }
        try {
          const { renderSlidesPdf } = await import("@/lib/pdf-slides");
          const { chooseCaseStudy } = await import("@/lib/pitch-constants");
          const content = draft.pdf_content;
          // Case-Study-Auswahl: 1) Segment-Pattern-Match, 2) Claude-Vorschlag mit
          // Lead-Type-Validierung, 3) Lead-Type-aware Branchen-Match.
          // Gibt garantiert einen Case zurueck — keine "Keine Case Study"-Fehler mehr.
          const cs = chooseCaseStudy({
            segment:            lead.segment,
            leadType:           lead.pitch_lead_type ?? "branding",
            branche:            lead.website_summary,
            claudeSuggestedKey: content.case_study_key,
          });
          // v3-Felder bevorzugen, Legacy-Felder als Fallback (für Drafts aus
          // älteren Generationen, die noch slide1_* gespeichert haben).
          pdfBuffer = await renderSlidesPdf({
            content: {
              headline:      content.headline      ?? content.slide1_headline      ?? "",
              subline:       content.subline       ?? content.slide1_subline       ?? "",
              body_text:     content.body_text     ?? (content.slide1_bullets ?? []).join("\n"),
              key_statement: content.key_statement ?? content.slide1_these         ?? "",
            },
            caseStudy: cs,
            meta: { companyName: lead.company_name },
            // Fallback: branding (organisch) — universeller All-Arounder, falls
            // lead_type-Bestimmung doch mal nicht durchgelaufen ist.
            leadType: lead.pitch_lead_type ?? "branding",
            customPains: content.slide_2_pains,
          });
          pdfName = `PrimeSocial-Analyse-${lead.company_name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf`;
        } catch (e) {
          // Render-Fehler-Handling: nach 3 Versuchen draft als failed markieren,
          // damit nicht endlos retried wird (sonst bleibt der Draft pending
          // und der Lead wartet ewig auf Step 1).
          const newAttempts = (draft.pdf_attempts ?? 0) + 1;
          const errStr = String(e).slice(0, 200);
          if (newAttempts >= 3) {
            await updateDraft(draft.id, {
              status: "failed",
              pdf_attempts: newAttempts,
              error_reason: `PDF-Render nach 3 Versuchen fehlgeschlagen: ${errStr}`,
            });
            errors.push(`Draft ${draft.id}: PDF-Render 3× fehlgeschlagen für ${lead.company_name} → failed`);
          } else {
            await updateDraft(draft.id, {
              pdf_attempts: newAttempts,
              error_reason: `Versuch ${newAttempts}/3: ${errStr}`,
            });
            errors.push(`Draft ${draft.id}: PDF-Render Versuch ${newAttempts}/3 fehlgeschlagen (${lead.company_name}) — Retry morgen`);
          }
          continue; // NICHT ohne PDF senden
        }
      }

      const { sendTemplateEmail, textToHtml, PRIMESOCIAL_MEME_URL } = await import("@/lib/brevo");

      // Mail 2 (Recall + Meme) bekommt das Wiedererkennungs-Meme unter dem Body.
      const inlineImageUrl = draft.step_number === 2 ? PRIMESOCIAL_MEME_URL : undefined;
      const inlineImageAlt = draft.step_number === 2 ? "PrimeSocial" : undefined;

      // Erst DB-Eintrag erstellen → ID für Tracking-Pixel
      const emailRecord = await saveEmailSent({
        lead_id:          lead.id,
        step_number:      draft.step_number,
        step_name:        draft.step_name,
        subject:          draft.subject,
        body_html:        textToHtml(bodyText),
        body_text:        bodyText,
        pdf_url:          null,
        brevo_message_id: null,
        sent_to_email:    recipientEmail,
        sent_at:          new Date().toISOString(),
        opened_at:        null,
        clicked_at:       null,
        pitch_clicked_at: null,
        calendly_clicked_at: null,
        replied_at:       null,
        bounced:          false,
      });

      // Mail via Brevo senden (mit Tracking-Pixel + ggf. Meme/Buttons)
      const result = await sendTemplateEmail({
        to: { email: recipientEmail, name: lead.contact_first_name ?? lead.company_name },
        subject: draft.subject,
        bodyText,
        pdfBuffer,
        pdfName,
        inlineImageUrl,
        inlineImageAlt,
        pitchButton,
        calendlyButton,
        trackingId: emailRecord.id,
      });

      // Brevo Message-ID nachtragen
      if (result.messageId) {
        await updateEmailSent(emailRecord.id, { brevo_message_id: result.messageId });
      }

      // Draft als gesendet markieren
      await updateDraft(draft.id, { status: "sent", sent_at: new Date().toISOString(), body_text: bodyText });

      // Lead-Status aktualisieren
      const currentStepDef = WORKFLOW_STEPS.find((s) => s.step === draft.step_number);
      const nextStep       = WORKFLOW_STEPS.find((s) => s.step === draft.step_number + 1);
      const dayDiff        = nextStep && currentStepDef
        ? nextStep.day - currentStepDef.day
        : null;
      const nextDate = dayDiff
        ? new Date(Date.now() + dayDiff * 86_400_000).toISOString()
        : null;

      // ── Regel: Nach Step 5 (Breakup) → Newsletter-Liste (frühestens 30 Tage später) ──
      if (draft.step_number === 5) {
        const now = new Date().toISOString();
        // Nur in Newsletter aufnehmen wenn Lead nicht bounced / unsubscribed
        // und in einem mail-eligible Segment (INKONSISTENT, KEINEVIDEO, SOLIDE).
        // SOLIDE wäre auch eligible, kann hier aber nicht mehr auftreten (siehe Filter
        // weiter oben in dieser Funktion — SOLIDE/KEININSTAGRAM/KEINFIT werden vorab geskipped).
        const eligibleForNewsletter =
          lead.status !== "bounced" &&
          lead.status !== "unsubscribed" &&
          (lead.segment === "INKONSISTENT" || lead.segment === "KEINEVIDEO");

        const updates: Record<string, unknown> = {
          workflow_step: 5,
          status: "paused",
          pause_reason: "completed",
          next_touchpoint_at: null,
        };

        if (eligibleForNewsletter) {
          // Newsletter-Subscriber anlegen mit subscribed_at = jetzt + 30 Tage
          // So bekommt der Lead frühestens 30 Tage nach der Breakup-Mail den ersten Newsletter
          const newsletterStartDate = new Date(Date.now() + 30 * 86_400_000).toISOString();
          try {
            await addSubscriber({
              email: recipientEmail,
              name: lead.contact_first_name ?? lead.company_name,
              lead_id: lead.id,
              unsubscribed_at: null,
              subscribed_at: newsletterStartDate,
            });
            updates.newsletter_subscribed_at = now;
          } catch { /* Duplikat ignorieren */ }
        }

        await updateLead(lead.id, updates);
      } else {
        await updateLead(lead.id, {
          workflow_step:      draft.step_number,
          status:             "active",
          next_touchpoint_at: nextDate,
        });
      }

      sent++;
    } catch (err) {
      errors.push(`Draft ${draft.id}: ${String(err)}`);
    }
  }

  return { sent, errors };
}
