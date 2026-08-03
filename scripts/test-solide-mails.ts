/**
 * Test-Skript: Sendet alle 7 Mails der SOLIDE-Sequenz an niklas@primesocial.de
 *
 * - Nutzt einen Mock-SOLIDE-Lead (keine DB-Schreibzugriffe)
 * - Steps 1-3 via Claude generiert (mit den neuen SOLIDE-Step-Rules)
 * - Steps 4-7 aus den neuen SOLIDE-Templates
 * - Step 1 mit PDF (falls pdfendpoint funktioniert), sonst ohne
 *
 * Ausführen: npx tsx scripts/test-solide-mails.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { Lead } from "../types";
import { WORKFLOW_STEPS } from "../types";
import { generateOpener, generateFollowUp } from "../lib/anthropic";
import { getStepTemplate } from "../lib/segments";
import { sendTemplateEmail } from "../lib/brevo";

const TO_EMAIL = "niklas@primesocial.de";

// ── Mock-Lead: realistischer SOLIDE-Case (Bäckerei aus Oldenburg) ────────────
const now = new Date();
function daysAgoIso(days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const MOCK_LEAD: Lead = {
  id: "mock-solide-test",
  company_name: "Hofbäckerei Wagner",
  contact_name: "Tobias Wagner",
  contact_first_name: "Tobias",
  contact_last_name: "Wagner",
  email: TO_EMAIL,
  private_email: null,
  city: "Oldenburg",
  website_url: "https://www.hofbaeckerei-wagner.de",
  website_summary:
    "Familiengeführte Bäckerei aus Oldenburg, drei Filialen, Fokus auf traditionelles Handwerk und regionale Zutaten. Bekannt für Sauerteig-Roggenbrot und handgerollte Croissants. Gegründet 1958, mittlerweile in dritter Generation. Beschäftigt rund 30 Mitarbeitende und bildet regelmäßig Bäckerlehrlinge aus.",
  instagram_handle: "hofbaeckerei.wagner",
  instagram_data: {
    username: "hofbaeckerei.wagner",
    fullName: "Hofbäckerei Wagner",
    biography: "Familienbäckerei aus Oldenburg seit 1958 🥐 3 Filialen | Tradition trifft Handwerk",
    followersCount: 4280,
    followsCount: 312,
    postsCount: 386,
    isVerified: false,
    profilePicUrl: "https://example.com/avatar.jpg",
    externalUrl: "https://www.hofbaeckerei-wagner.de",
    scrapedAt: now.toISOString(),
    latestPosts: [
      {
        id: "p1",
        timestamp: daysAgoIso(2),
        type: "Video",
        videoViewCount: 1850,
        likesCount: 145,
        commentsCount: 8,
        caption: "Sauerteig-Anschnitt — der Moment auf den wir morgens warten. So entsteht ein Roggenbrot mit echter Kruste.",
        url: "https://instagram.com/p/p1",
      },
      {
        id: "p2",
        timestamp: daysAgoIso(7),
        type: "Video",
        videoViewCount: 2410,
        likesCount: 198,
        commentsCount: 22,
        caption: "Frühschicht ab 4 Uhr — wenn die Stadt noch schläft, gehen bei uns die Öfen an.",
        url: "https://instagram.com/p/p2",
      },
      {
        id: "p3",
        timestamp: daysAgoIso(14),
        type: "Image",
        videoViewCount: null,
        likesCount: 89,
        commentsCount: 4,
        caption: "Neue Sorte: Mandel-Honig-Croissant. Ab Samstag in allen Filialen.",
        url: "https://instagram.com/p/p3",
      },
      {
        id: "p4",
        timestamp: daysAgoIso(20),
        type: "Video",
        videoViewCount: 3120,
        likesCount: 220,
        commentsCount: 15,
        caption: "Wie wir unser Hausbrot machen — vom Mehl bis zum Anschnitt in 90 Sekunden.",
        url: "https://instagram.com/p/p4",
      },
      {
        id: "p5",
        timestamp: daysAgoIso(27),
        type: "Video",
        videoViewCount: 1640,
        likesCount: 134,
        commentsCount: 12,
        caption: "Willkommen Felix — unser neuer Lehrling im 1. Jahr. Hat heute schon seine ersten Brötchen geformt.",
        url: "https://instagram.com/p/p5",
      },
      {
        id: "p6",
        timestamp: daysAgoIso(34),
        type: "Image",
        videoViewCount: null,
        likesCount: 76,
        commentsCount: 3,
        caption: "Ostergebäck-Sortiment ist online. Vorbestellen lohnt sich.",
        url: "https://instagram.com/p/p6",
      },
      {
        id: "p7",
        timestamp: daysAgoIso(41),
        type: "Video",
        videoViewCount: 1920,
        likesCount: 156,
        commentsCount: 9,
        caption: "Brotzeit für eine Baustelle in Oldenburg — 80 belegte Brötchen für die Frühschicht.",
        url: "https://instagram.com/p/p7",
      },
      {
        id: "p8",
        timestamp: daysAgoIso(48),
        type: "Video",
        videoViewCount: 2780,
        likesCount: 211,
        commentsCount: 18,
        caption: "Croissant rollen — Schritt für Schritt erklärt. Das Geheimnis liegt im Butterteig.",
        url: "https://instagram.com/p/p8",
      },
      {
        id: "p9",
        timestamp: daysAgoIso(56),
        type: "Carousel",
        videoViewCount: null,
        likesCount: 92,
        commentsCount: 6,
        caption: "Tour durch unsere drei Filialen — Innenstadt, Eversten und Wechloy.",
        url: "https://instagram.com/p/p9",
      },
      {
        id: "p10",
        timestamp: daysAgoIso(63),
        type: "Video",
        videoViewCount: 1480,
        likesCount: 124,
        commentsCount: 7,
        caption: "Mein Großvater hat noch alles per Hand gemacht. Vieles davon machen wir heute genauso.",
        url: "https://instagram.com/p/p10",
      },
      {
        id: "p11",
        timestamp: daysAgoIso(70),
        type: "Video",
        videoViewCount: 2100,
        likesCount: 178,
        commentsCount: 11,
        caption: "Dinkel oder Weizen? Was ihr wissen solltet bevor ihr euer Brot kauft.",
        url: "https://instagram.com/p/p11",
      },
      {
        id: "p12",
        timestamp: daysAgoIso(76),
        type: "Video",
        videoViewCount: 1690,
        likesCount: 142,
        commentsCount: 9,
        caption: "Brot in 3 Schritten erkennen — woran ihr ein gutes Bäckerei-Brot sofort merkt.",
        url: "https://instagram.com/p/p12",
      },
    ],
  },
  instagram_problem:
    "Organisch läuft es solide — aber die Reaktionen kommen fast ausschließlich aus dem bestehenden Follower-Kreis. Neue Zielgruppen werden organisch kaum erreicht.",
  segment: "SOLIDE",
  segment_reasoning: "Account postet regelmäßig (max 7d Lücke), aktiv (letzter Post 2d), Avg 2100 Video-Views, kein 10x Ausreißer.",
  workflow_step: 0,
  workflow_started_at: null,
  next_touchpoint_at: null,
  status: "new",
  pitch_page_id: null,
  pitch_page_url: null,
  pitch_lead_type: null,
  pause_reason: null,
  last_scraped_at: now.toISOString(),
  last_meta_ads_check_at: null,
  meta_ads_signal: null,
  newsletter_subscribed_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};

// ────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🥐 SOLIDE-Test: ${MOCK_LEAD.company_name}`);
  console.log(`   Empfänger: ${TO_EMAIL}`);
  console.log(`   Segment: ${MOCK_LEAD.segment}\n`);

  const subjectsSoFar: string[] = [];
  const firstName = MOCK_LEAD.contact_first_name ?? MOCK_LEAD.company_name;

  for (const step of WORKFLOW_STEPS) {
    console.log(`\n📧 Step ${step.step}: ${step.name} (${step.type})`);

    let subject = "";
    let bodyText = "";
    let pdfUrl: string | undefined;
    let pdfName: string | undefined;

    try {
      if (step.type === "claude_opener") {
        console.log(`   ⏳ Generiere Opener mit Claude...`);
        const opener = await generateOpener(MOCK_LEAD);
        subject = opener.subject;
        bodyText = opener.body;

        try {
          const { generatePdf } = await import("../lib/pdfendpoint");
          console.log(`   ⏳ Generiere PDF...`);
          pdfUrl = await generatePdf(MOCK_LEAD, {
            pdf_start: opener.pdf_start,
            pdf_problem: opener.pdf_problem,
            "pdf_lösung": opener["pdf_lösung"],
          });
          pdfName = `PrimeSocial-Analyse-${MOCK_LEAD.company_name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf`;
          console.log(`   📎 PDF generiert: ${pdfUrl}`);
        } catch (pdfErr) {
          console.error(`   ⚠️ PDF-Generierung fehlgeschlagen — sende Mail ohne PDF:`, pdfErr);
        }
      } else if (step.type === "template") {
        const tpl = getStepTemplate(step.step, MOCK_LEAD.segment ?? "SOLIDE", firstName);
        subject = tpl?.subject ?? `[Template fehlt: Step ${step.step}]`;
        bodyText = tpl?.body ?? "";
      } else {
        console.log(`   ⏳ Generiere Follow-Up (Step ${step.step}) mit Claude...`);
        const generated = await generateFollowUp(MOCK_LEAD, step.step, subjectsSoFar);
        subject = generated.subject;
        bodyText = generated.body;
      }
    } catch (err) {
      console.error(`   ❌ Generierung fehlgeschlagen für Step ${step.step}:`, err);
      continue;
    }

    subjectsSoFar.push(subject);
    console.log(`   📝 Betreff: ${subject}`);

    try {
      const result = await sendTemplateEmail({
        to: { email: TO_EMAIL, name: firstName },
        subject: `[SOLIDE-Test S${step.step}] ${subject}`,
        bodyText,
        pdfUrl,
        pdfName,
      });
      console.log(`   ✅ Versendet (Brevo ID: ${result.messageId ?? "—"})`);
    } catch (err) {
      console.error(`   ❌ Versand fehlgeschlagen:`, err);
    }
  }

  console.log(`\n✅ Fertig — alle 7 Mails an ${TO_EMAIL} versendet.`);
}

run().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
