import { NextRequest, NextResponse } from "next/server";
import { getLeads, getLead, updateLead, getEmailsForLead } from "@/lib/supabase";
import { scrapeInstagramProfile } from "@/lib/apify";
import { classifySegment } from "@/lib/segments";
import { sendDueDrafts, generateAndSaveAllDrafts } from "@/lib/sequences";
import { extractInstagramHandle } from "@/lib/instagram";
import { sendReportEmail, sendAlertEmail } from "@/lib/brevo";
import { analyzeSubjectLines, saveSubjectInsights, analyzeSendTimes, saveSendTimeInsight, getBestSendTime } from "@/lib/subject-optimizer";
import type { Segment } from "@/types";

// Hard-Cap für den täglichen Cron. Apify-Scrape pro Lead ~10-30s, plus Claude
// pro Lead ~20s, plus Brevo-Versand. Vercel Pro erlaubt bis 300s.
// Der Cron MUSS in dieser Zeit fertig sein — wenn nicht, ist die Last zu hoch
// und MAX_MAILS_PER_DAY / MAX_SCRAPE_PER_DAY müssen runter.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_MAILS_PER_DAY = parseInt(process.env.MAX_MAILS_PER_DAY ?? "10");
const MAX_SCRAPE_PER_DAY = parseInt(process.env.MAX_SCRAPE_PER_DAY ?? "10");
// Outreach aktivieren — auf "true" setzen zum Aktivieren
const OUTREACH_ENABLED = process.env.OUTREACH_ENABLED === "true";

// ── Segment → instagram_problem Mapping ──────────────────────────
const SEGMENT_PROBLEM_TEXT: Record<string, string> = {
  KEINEVIDEO: "Postet fast nur Bilder und Grafiken, keine Videos/Reels",
  INAKTIV: "Letzter Post vor mehreren Wochen/Monaten",
  INKONSISTENT: "Unregelmäßiges Posting-Muster, Schübe mit langen Pausen",
  WENIGREICHWEITE: "Postet regelmäßig aber kaum Reichweite für den Aufwand",
  VIRALAUSREISSER: "Ein Post viral, restlicher Feed performt deutlich schwächer",
  SOLIDE: "Solider Account — kein Outreach nötig",
  KEINFIT: "Kein Fit für PrimeSocial",
  KEININSTAGRAM: "Kein Instagram-Account vorhanden oder nicht erreichbar",
};

function getInstagramProblem(segment: Segment, data?: { latestPosts?: { timestamp?: string }[] } | null): string {
  // For INAKTIV, calculate how long ago the last post was
  if (segment === "INAKTIV" && data?.latestPosts?.length) {
    const postDates = data.latestPosts
      .map((p) => (p.timestamp ? new Date(p.timestamp) : null))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime());
    if (postDates.length > 0) {
      const daysSince = Math.floor((Date.now() - postDates[0].getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 60) {
        const months = Math.floor(daysSince / 30);
        return `Letzter Post vor ${months} Monaten`;
      }
      return `Letzter Post vor ${daysSince} Tagen`;
    }
  }
  return SEGMENT_PROBLEM_TEXT[segment] ?? "Unbekanntes Segment";
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];
  const errors: string[] = [];

  // Stats for the daily report
  let leadsScraped = 0;
  const leadsSegmented: Record<string, number> = {};
  let emailsVerified = 0;
  let emailsBounced = 0;
  let emailsSent = 0;
  let emailsOpened = 0;

  // Sonntag = Ruhetag: keine neuen Leads scrapen/segmentieren, keine
  // Mail-1-Opener versenden. Follow-Up-Mails (2-5) gehen aber raus, weil
  // sie ja keine Erst-Ansprache sind — der Lead kennt uns schon.
  const berlinDay = new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin", weekday: "short" });
  const isSunday = berlinDay === "Sun";

  try {
    // ── 1. Neue Leads verarbeiten (max MAX_SCRAPE_PER_DAY pro Tag) ──
    if (isSunday) {
      log.push("Sonntag = Ruhetag: keine neuen Leads gescrapt/segmentiert");
    }
    const allNewLeads = isSunday ? [] : await getLeads({ status: "new" });
    const newLeads = allNewLeads.slice(0, MAX_SCRAPE_PER_DAY);
    if (!isSunday) {
      log.push(`${allNewLeads.length} neue Leads, verarbeite ${newLeads.length} (Limit: ${MAX_SCRAPE_PER_DAY})`);
    }

    for (let lead of newLeads) {
      try {
        // ── Regel: Keine E-Mail (weder privat noch Firma) → überspringen ──
        const recipientEmail = lead.private_email || lead.email;
        if (!recipientEmail) {
          await updateLead(lead.id, { status: "paused" });
          log.push(`${lead.company_name}: Keine E-Mail → pausiert`);
          continue;
        }

        // ── Regel: Duplikat-Schutz — Lead war schon im Workflow ──
        const existingEmails = await getEmailsForLead(lead.id);
        if (existingEmails.length > 0) {
          log.push(`${lead.company_name}: Bereits ${existingEmails.length} Mails gesendet → übersprungen`);
          continue;
        }

        // ── Instagram scrapen (nur wenn Handle vorhanden & noch keine Daten) ──
        if (lead.instagram_handle && !lead.instagram_data) {
          // 24h-Pause zwischen Retry-Versuchen: schützt vor kurzfristigen
          // Apify-Outages, die sonst alle 3 Versuche an einem Tag verbrennen.
          if ((lead.scrape_attempts ?? 0) > 0 && lead.last_scrape_attempt_at) {
            const hoursSinceLast =
              (Date.now() - new Date(lead.last_scrape_attempt_at).getTime()) / 3_600_000;
            if (hoursSinceLast < 24) {
              log.push(`${lead.company_name}: Apify-Retry erst nach 24h möglich (zuletzt vor ${hoursSinceLast.toFixed(1)}h)`);
              continue;
            }
          }
          try {
            const cleanHandle = extractInstagramHandle(lead.instagram_handle);
            const igData = await scrapeInstagramProfile(cleanHandle);
            const segment = classifySegment(igData);
            leadsScraped++;
            leadsSegmented[segment] = (leadsSegmented[segment] ?? 0) + 1;

            // ── Routing-Entscheidung über Segment ──
            const { getSegmentRouting, MAIL_ELIGIBLE_SEGMENTS } = await import("@/lib/segments");
            const routing = getSegmentRouting(segment);
            const now = new Date().toISOString();
            if (routing.status === "paused") {
              await updateLead(lead.id, {
                instagram_data: igData,
                segment,
                status: "paused",
                pause_reason: routing.pause_reason,
                last_scraped_at: now,
                instagram_problem: getInstagramProblem(segment, igData),
              });
              log.push(`${lead.company_name}: ${segment} → ${routing.pause_reason}`);
              continue;
            }
            // SOLIDE → mail-eligible nach Ad-Library-Check (Phase 2 nicht implementiert)
            // → für jetzt: trotzdem pausen mit pause_reason="meta_ads_active" als Platzhalter
            if (segment === "SOLIDE") {
              await updateLead(lead.id, {
                instagram_data: igData,
                segment,
                status: "paused",
                pause_reason: "meta_ads_active",
                last_scraped_at: now,
                instagram_problem: getInstagramProblem(segment, igData),
              });
              log.push(`${lead.company_name}: SOLIDE → wartet auf Ad-Library-Check`);
              continue;
            }
            // INKONSISTENT, KEINEVIDEO → in Mail-Flow
            if (!MAIL_ELIGIBLE_SEGMENTS.includes(segment)) {
              // Sicherheitsnetz, sollte nie eintreten
              continue;
            }

            // ── E-Mail-Verifizierung deaktiviert (Hunter-Credits sparen) ──
            // Bounces werden ohnehin vom Brevo-Webhook getrackt (hard_bounce →
            // status='bounced') und im Dashboard angezeigt. Priorität bleibt:
            // private_email zuerst, sonst lead.email als Fallback (siehe
            // getRecipientEmail() in sequences.ts).

            await updateLead(lead.id, {
              instagram_data: igData,
              instagram_handle: cleanHandle,
              segment,
              instagram_problem: getInstagramProblem(segment, igData),
            });
          } catch (e) {
            // ── Retry-Logik: bis zu 3 Versuche bevor Lead endgültig als
            //   KEININSTAGRAM markiert wird. Trennt "Apify temporär kaputt"
            //   (Retry sinnvoll) von "Handle existiert wirklich nicht" (klar
            //   nach 3× Versuch).
            const previousAttempts = lead.scrape_attempts ?? 0;
            const newAttempts = previousAttempts + 1;
            const attemptNow = new Date().toISOString();
            if (newAttempts >= 3) {
              await updateLead(lead.id, {
                segment: "KEININSTAGRAM",
                status: "paused",
                pause_reason: "no_instagram",
                scrape_attempts: newAttempts,
                last_scrape_attempt_at: attemptNow,
                instagram_problem: `Nach 3 Versuchen kein Scrape möglich: ${String(e)}`,
              });
              log.push(`${lead.company_name}: 3× Scrape fehlgeschlagen → KEININSTAGRAM`);
              errors.push(`${lead.company_name}: Endgültig fehlgeschlagen – ${String(e)}`);
            } else {
              await updateLead(lead.id, {
                scrape_attempts: newAttempts,
                last_scrape_attempt_at: attemptNow,
                instagram_problem: `Versuch ${newAttempts}/3 fehlgeschlagen (Retry frühestens in 24h): ${String(e)}`,
              });
              log.push(`${lead.company_name}: Scrape-Versuch ${newAttempts}/3 fehlgeschlagen — Retry in 24h`);
              errors.push(`${lead.company_name}: Instagram-Fehler (${newAttempts}/3) – ${String(e)}`);
            }
            continue;
          }
        } else if (!lead.instagram_handle) {
          // Kein Instagram-Handle → KEININSTAGRAM
          await updateLead(lead.id, {
            segment: "KEININSTAGRAM",
            status: "paused",
            instagram_problem: "Kein Instagram-Handle hinterlegt",
          });
          log.push(`${lead.company_name}: Kein Instagram → pausiert`);
          continue;
        }

        // ── Website Summary generieren (mit Retry-Logik) ──
        // Pflicht für Mail-Generierung. Max 3 Versuche mit 24h-Pause zwischen
        // den Versuchen. Bei 3× Fehlschlag: Lead landet im KEINSUMMARY-Segment
        // und wird nicht erneut probiert (außer manueller Reset).
        if (!lead.website_summary && lead.website_url) {
          const summaryAttempts = lead.summary_attempts ?? 0;

          if (lead.last_summary_attempt_at) {
            const hoursSinceLast =
              (Date.now() - new Date(lead.last_summary_attempt_at).getTime()) / 3_600_000;
            if (summaryAttempts > 0 && hoursSinceLast < 24) {
              log.push(`${lead.company_name}: Summary-Retry erst nach 24h (zuletzt vor ${hoursSinceLast.toFixed(1)}h) — überspringe heute`);
              continue;
            }
          }

          const attemptNow = new Date().toISOString();
          let summaryText: string | null = null;
          let summaryError: string | null = null;
          try {
            const { scrapeWebsiteForContact } = await import("@/lib/website-scraper");
            const websiteData = await scrapeWebsiteForContact(lead.website_url);
            if (websiteData.websiteSummary && websiteData.websiteSummary.trim().length > 0) {
              summaryText = websiteData.websiteSummary;
            } else {
              summaryError = "Scrape lieferte leeres Summary";
            }
          } catch (e) {
            summaryError = String(e).slice(0, 120);
          }

          if (summaryText) {
            const updated = await updateLead(lead.id, {
              website_summary: summaryText,
              summary_attempts: summaryAttempts + 1,
              last_summary_attempt_at: attemptNow,
            });
            lead = updated; // lokales Objekt synchron halten
            log.push(`${lead.company_name}: Website-Summary erstellt (Versuch ${summaryAttempts + 1})`);
          } else {
            const newAttempts = summaryAttempts + 1;
            if (newAttempts >= 3) {
              // Endgültig raus — landet im KEINSUMMARY-Segment, kein Re-Scrape
              await updateLead(lead.id, {
                segment: "KEINSUMMARY",
                status: "paused",
                pause_reason: "no_summary",
                summary_attempts: newAttempts,
                last_summary_attempt_at: attemptNow,
                instagram_problem: `Nach 3 Versuchen keine Website-Summary: ${summaryError ?? "unbekannt"}`,
              });
              log.push(`${lead.company_name}: 3× Website-Summary fehlgeschlagen → KEINSUMMARY`);
              errors.push(`${lead.company_name}: Website-Summary endgültig fehlgeschlagen – ${summaryError ?? "?"}`);
            } else {
              await updateLead(lead.id, {
                summary_attempts: newAttempts,
                last_summary_attempt_at: attemptNow,
                instagram_problem: `Website-Summary Versuch ${newAttempts}/3 fehlgeschlagen (Retry in 24h): ${summaryError ?? "?"}`,
              });
              log.push(`${lead.company_name}: Website-Summary Versuch ${newAttempts}/3 fehlgeschlagen — Retry in 24h`);
            }
            // Lead heute nicht weiter verarbeiten — Sequenz braucht das Summary.
            continue;
          }
        } else if (!lead.website_summary && !lead.website_url) {
          // Keine website_url → können wir nichts scrapen. Lead bleibt heute
          // unbearbeitet (kein automatisches KEINSUMMARY, weil das nicht
          // unbedingt ein dauerhafter Defekt ist — vielleicht trägt der User
          // die URL später nach).
          log.push(`${lead.company_name}: Keine website_url, kein Summary möglich → übersprungen`);
          continue;
        }

        if (OUTREACH_ENABLED) {
          // Lead aktivieren und Sequenzen generieren
          const updatedLead = await updateLead(lead.id, {
            status: "active",
            workflow_started_at: new Date().toISOString(),
          });

          try {
            const drafts = await generateAndSaveAllDrafts(updatedLead);
            log.push(`${lead.company_name}: ${updatedLead.segment}, ${drafts.length} Mails vorberechnet`);
          } catch (e) {
            log.push(`${lead.company_name}: Sequenz-Fehler – ${String(e)}`);
            errors.push(`${lead.company_name}: Sequenz-Fehler – ${String(e)}`);
          }
        } else {
          // Nur Daten speichern, noch keine Mails — Status bleibt "new" mit Segment
          log.push(`${lead.company_name}: ${lead.segment ?? "?"} — aufgewertet (Outreach deaktiviert)`);
        }
      } catch (e) {
        log.push(`${lead.company_name}: Fehler – ${String(e)}`);
        errors.push(`${lead.company_name}: ${String(e)}`);
      }
    }

    // ── 1b. Re-Scrape: Watching-Leads alle 3 Monate erneut prüfen ──
    // Leads mit pause_reason='segment_watch' (INAKTIV/VIRALAUSREISSER/WENIGREICHWEITE)
    // werden nach RESCRAPE_INTERVAL_DAYS erneut gescrapt. Wenn das neue Segment
    // mail-eligible ist (INKONSISTENT/KEINEVIDEO), werden sie aktiviert.
    // Limit: das verbleibende Scrape-Budget des Tages.
    // Sonntag: kein Re-Scrape, weil Re-Scrape ggf. zu neuer Erst-Ansprache führt.
    try {
      const { getSegmentRouting, MAIL_ELIGIBLE_SEGMENTS, RESCRAPE_INTERVAL_DAYS } = await import("@/lib/segments");
      const remaining = MAX_SCRAPE_PER_DAY - leadsScraped;
      if (!isSunday && remaining > 0) {
        const allLeads = await getLeads({});
        const rescrapeThreshold = Date.now() - RESCRAPE_INTERVAL_DAYS * 86_400_000;
        const dueForRescrape = allLeads
          .filter((l) =>
            l.pause_reason === "segment_watch" &&
            l.instagram_handle &&
            (!l.last_scraped_at || new Date(l.last_scraped_at).getTime() < rescrapeThreshold),
          )
          .slice(0, remaining);

        if (dueForRescrape.length > 0) {
          log.push(`Re-Scrape: ${dueForRescrape.length} Watching-Leads fällig`);
        }

        for (const lead of dueForRescrape) {
          try {
            const cleanHandle = extractInstagramHandle(lead.instagram_handle!);
            const igData = await scrapeInstagramProfile(cleanHandle);
            const newSegment = classifySegment(igData);
            const routing = getSegmentRouting(newSegment);
            const now = new Date().toISOString();
            leadsScraped++;

            if (routing.status === "active" && newSegment !== "SOLIDE" && MAIL_ELIGIBLE_SEGMENTS.includes(newSegment)) {
              // Wechsel von Watching → Mail-Flow
              await updateLead(lead.id, {
                instagram_data: igData,
                segment: newSegment,
                status: "active",
                pause_reason: null,
                last_scraped_at: now,
                workflow_step: 1,
                workflow_started_at: now,
                next_touchpoint_at: now,
                instagram_problem: getInstagramProblem(newSegment, igData),
              });
              // Drafts vorberechnen (fire-and-forget)
              const refreshed = await getLead(lead.id);
              generateAndSaveAllDrafts(refreshed).catch((e) =>
                log.push(`${lead.company_name}: Draft-Generierung nach Re-Scrape fehlgeschlagen: ${String(e)}`),
              );
              log.push(`${lead.company_name}: Watching → ${newSegment} (in Mail-Flow)`);
            } else {
              // Bleibt im Watching oder neuer pause_reason
              await updateLead(lead.id, {
                instagram_data: igData,
                segment: newSegment,
                status: routing.status,
                pause_reason: routing.pause_reason,
                last_scraped_at: now,
                instagram_problem: getInstagramProblem(newSegment, igData),
              });
              log.push(`${lead.company_name}: bleibt ${newSegment} (${routing.pause_reason})`);
            }
          } catch (e) {
            errors.push(`Re-Scrape ${lead.company_name}: ${String(e)}`);
          }
        }
      }
    } catch (e) {
      errors.push(`Re-Scrape-Block: ${String(e)}`);
    }

    // ── 2. Fällige Drafts automatisch versenden ────────────────────
    if (OUTREACH_ENABLED) {
      const result = await sendDueDrafts(MAX_MAILS_PER_DAY);
      emailsSent = result.sent;
      log.push(`${emailsSent} Mails gesendet`);
      if (result.errors.length > 0) {
        log.push(`${result.errors.length} Fehler: ${result.errors.slice(0, 3).join(", ")}`);
        errors.push(...result.errors);
      }
    } else {
      log.push("Outreach deaktiviert — keine Mails gesendet");
    }

    // ── 3. Betreffzeilen-Optimierung ──────────────────────────────
    try {
      const insights = await analyzeSubjectLines();
      if (insights.length > 0) {
        await saveSubjectInsights(insights);
        log.push(`${insights.length} Betreffzeilen-Insights aktualisiert`);
      }
    } catch (e) {
      log.push(`Subject-Optimizer Fehler: ${String(e)}`);
    }

    // ── 3b. Versandzeit-Optimierung ─────────────────────────────
    try {
      const timeInsight = await analyzeSendTimes();
      if (timeInsight) {
        await saveSendTimeInsight(timeInsight);
        log.push(`Versandzeit-Insight: ${timeInsight.recommendation}`);
      }
    } catch (e) {
      log.push(`Versandzeit-Optimizer Fehler: ${String(e)}`);
    }

    // ── 4. Statistiken sammeln und Report senden ───────────────────
    const allLeads = await getLeads();
    const activeLeads = allLeads.filter((l) => l.status === "active");

    // KPIs berechnen
    const leadsByStatus: Record<string, number> = {};
    for (const l of allLeads) {
      leadsByStatus[l.status] = (leadsByStatus[l.status] ?? 0) + 1;
    }

    const today = new Date().toISOString().slice(0, 10);
    try {
      await sendReportEmail({
        date: today,
        leadsScraped,
        leadsSegmented,
        emailsVerified,
        emailsBounced,
        emailsSent,
        emailsOpened,
        errors,
        totalLeads: allLeads.length,
        activeLeads: activeLeads.length,
        outreachEnabled: OUTREACH_ENABLED,
        leadsByStatus,
        leadsWithoutSegment: allLeads.filter((l) => !l.segment).length,
        leadsWithoutEmail: allLeads.filter((l) => !l.email && !l.private_email).length,
        completedLeads: allLeads.filter((l) => l.workflow_step >= 7).length,
        bestSendTime: (await getBestSendTime())?.recommendation,
      });
      log.push("Report-E-Mail gesendet");
    } catch (e) {
      log.push(`Report-E-Mail Fehler: ${String(e)}`);
    }

    return NextResponse.json({
      success: true,
      log,
      sent: emailsSent,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    log.push(`Fehler: ${String(e)}`);

    // Send alert email for unhandled errors
    try {
      await sendAlertEmail(
        "\u26A0\uFE0F PrimeSocial Cron Fehler",
        `Unbehandelter Fehler im täglichen Cron-Job:\n\n${String(e)}\n\nLog bis zum Fehler:\n${log.join("\n")}`
      );
    } catch (_alertErr) {
      console.error("Konnte Alert-E-Mail nicht senden:", _alertErr);
    }

    return NextResponse.json({ success: false, log, error: String(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
