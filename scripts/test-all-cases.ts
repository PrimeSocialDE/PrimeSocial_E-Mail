/**
 * Test-Skript: Generiert für 8 Mock-Cases jeweils PDF (Mail 1) + Pitch-Seite (Mail 3).
 * Sendet danach 2 Mails an niklas@primesocial.de:
 *   1. "[ALL-CASES] PDFs für alle 8 Mock-Leads" — mit allen 8 PDFs als Anhängen
 *   2. "[ALL-CASES] Pitch-Seiten für alle 8 Mock-Leads" — Liste mit Links
 *
 * Aufschlüsselung:
 *   KEINEVIDEO: recruiting | leadgen | branding
 *   INKONSISTENT: recruiting | leadgen | branding
 *   SOLIDE: recruiting | meta_ads
 *
 * Ausführen: npx tsx scripts/test-all-cases.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { Lead, InstagramPost, Segment } from "../types";
import { generateOpener, generatePitchPageContent } from "../lib/anthropic";
import { sendTransactionalEmail } from "../lib/brevo";
import { renderSlidesPdf } from "../lib/pdf-slides";
import { CASE_STUDIES, matchCaseStudies, generatePitchSlug, caseStudyForSegment } from "../lib/pitch-constants";
import { createLead, createPitchPage, getPitchPageByLeadId } from "../lib/supabase";

const TO_EMAIL = "niklas@primesocial.de";
const BASE_URL = "https://mail.primesocial.de";
const NON_PROD_COLUMNS = ["last_meta_ads_check_at", "meta_ads_signal", "newsletter_subscribed_at", "last_scraped_at", "pause_reason", "pitch_lead_type"];

const now = new Date();
function daysAgoIso(days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ─── Post-Builder pro Segment-Pattern ────────────────────────────────────────
function keinevideoPosts(captions: string[]): InstagramPost[] {
  // alle Bilder/Carousel, regelmäßig alle ~6 Tage, kein Video
  return captions.slice(0, 12).map((caption, i) => ({
    id: `p${i + 1}`,
    timestamp: daysAgoIso(3 + i * 6),
    type: i % 2 === 0 ? "Image" : "Carousel",
    videoViewCount: null,
    likesCount: 40 + ((i * 7) % 35),
    commentsCount: 1 + ((i * 3) % 6),
    caption,
    url: `https://instagram.com/p/p${i + 1}`,
  }));
}

function inkonsistentPosts(captions: string[]): InstagramPost[] {
  // Lücken > 14 Tage zwischen Posts, Mix aus Bildern und Reels
  const gaps = [3, 4, 21, 8, 23, 6, 18, 5, 20, 7, 24, 9];
  let day = 0;
  return captions.slice(0, 12).map((caption, i) => {
    day += gaps[i] ?? 10;
    const isReel = i % 3 === 1;
    return {
      id: `p${i + 1}`,
      timestamp: daysAgoIso(day),
      type: isReel ? "Video" : (i % 2 === 0 ? "Image" : "Carousel"),
      videoViewCount: isReel ? 800 + ((i * 113) % 400) : null,
      likesCount: 30 + ((i * 11) % 40),
      commentsCount: 1 + ((i * 2) % 5),
      caption,
      url: `https://instagram.com/p/p${i + 1}`,
    };
  });
}

function solidePosts(captions: string[]): InstagramPost[] {
  // Regelmäßig (max 6 Tage Lücke), alle Reels mit avg > 500 Views, kein 10x Ausreißer
  return captions.slice(0, 12).map((caption, i) => ({
    id: `p${i + 1}`,
    timestamp: daysAgoIso(2 + i * 5),
    type: "Video",
    videoViewCount: 1500 + ((i * 197) % 1200),
    likesCount: 110 + ((i * 13) % 90),
    commentsCount: 6 + ((i * 3) % 12),
    caption,
    url: `https://instagram.com/p/p${i + 1}`,
  }));
}

// ─── Lead-Builder ────────────────────────────────────────────────────────────
interface MockLead {
  label: string;             // z.B. "KEINEVIDEO_recruiting"
  segment: Segment;
  forceLeadType: "recruiting" | "leadgen" | "branding";
  forceFocusArea: "recruiting" | "meta_ads" | "organic";
  data: Omit<Lead, "id" | "created_at" | "updated_at">;
}

function buildLead(args: {
  label: string;
  segment: Segment;
  forceLeadType: "recruiting" | "leadgen" | "branding";
  forceFocusArea: "recruiting" | "meta_ads" | "organic";
  company: string;
  contactFirst: string;
  contactLast: string;
  city: string;
  websiteSummary: string;
  igHandle: string;
  igFollowers: number;
  igPosts: number;
  igBio: string;
  posts: InstagramPost[];
  problem: string;
}): MockLead {
  return {
    label: args.label,
    segment: args.segment,
    forceLeadType: args.forceLeadType,
    forceFocusArea: args.forceFocusArea,
    data: {
      company_name: `[TEST] ${args.company}`,
      contact_name: `${args.contactFirst} ${args.contactLast}`,
      contact_first_name: args.contactFirst,
      contact_last_name: args.contactLast,
      email: TO_EMAIL,
      private_email: null,
      city: args.city,
      website_url: `https://www.${args.igHandle.replace(/\./g, "-")}.de`,
      website_summary: args.websiteSummary,
      instagram_handle: args.igHandle,
      instagram_data: {
        username: args.igHandle,
        fullName: args.company,
        biography: args.igBio,
        followersCount: args.igFollowers,
        followsCount: 200,
        postsCount: args.igPosts,
        isVerified: false,
        profilePicUrl: "https://example.com/avatar.jpg",
        externalUrl: `https://www.${args.igHandle.replace(/\./g, "-")}.de`,
        scrapedAt: now.toISOString(),
        latestPosts: args.posts,
      },
      instagram_problem: args.problem,
      segment: args.segment,
      segment_reasoning: `Auto: ${args.segment}`,
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
    },
  };
}

// ─── 8 Mock-Cases ────────────────────────────────────────────────────────────
const MOCKS: MockLead[] = [
  // 1. KEINEVIDEO + recruiting
  buildLead({
    label: "KEINEVIDEO_recruiting",
    segment: "KEINEVIDEO",
    forceLeadType: "recruiting",
    forceFocusArea: "recruiting",
    company: "Schreinerei Bartels",
    contactFirst: "Tobias",
    contactLast: "Bartels",
    city: "Westerstede",
    websiteSummary:
      "Familiengeführte Schreinerei aus Westerstede in dritter Generation. Schwerpunkte: individuelle Möbel, Innenausbau für Privat und Gewerbe, Restaurierung. 18 Mitarbeitende. Aktuell offen: Schreiner-Lehrling für 2026, Geselle (m/w/d) Innenausbau. Auf Karriereseite mehrere Stellenanzeigen.",
    igHandle: "schreinerei.bartels",
    igFollowers: 1850,
    igPosts: 220,
    igBio: "Schreinerei Bartels · Westerstede · Möbel, Innenausbau, Restaurierung · Wir suchen Lehrlinge 2026",
    posts: keinevideoPosts([
      "Eine neue Küche aus Eiche massiv für Familie M. — Zeit zum Entstehen: 6 Wochen.",
      "Karussell: 5 Sachen die ihr beim Möbelkauf wissen solltet.",
      "Wir suchen einen Lehrling für 2026 — alle Infos im Karussell.",
      "Restaurierung eines historischen Schranks aus 1890. Vorher/Nachher-Bilder.",
      "Werkstatt-Eindrücke: hier entstehen unsere Möbel. Bilder von gestern.",
      "Karussell: Wie ein Esstisch entsteht — Schritt für Schritt erklärt.",
      "Neue Bürozeile für eine Praxis in Oldenburg. Foto von der Übergabe.",
      "Karussell: 4 Holzarten und wofür sie geeignet sind.",
      "Team-Foto: Lehrlinge und Gesellen vor dem Werkstatttor.",
      "Karussell: 5 Mythen über Massivholz, die einfach nicht stimmen.",
      "Eiche, Buche oder Nussbaum? Bild-Vergleich der drei beliebtesten Holzarten.",
      "Karussell: So pflegt ihr eure Holzmöbel richtig — 6 Tipps.",
    ]),
    problem:
      "Inhalte vermitteln Handwerk gut, aber rein in Bild- und Karussell-Format. Reels würden Werkstatt-Atmosphäre und Menschen besser transportieren — wichtig für Bewerber-Generation.",
  }),

  // 2. KEINEVIDEO + leadgen
  buildLead({
    label: "KEINEVIDEO_leadgen",
    segment: "KEINEVIDEO",
    forceLeadType: "leadgen",
    forceFocusArea: "meta_ads",
    company: "Intax Steuerberatung",
    contactFirst: "Max",
    contactLast: "Mustermann",
    city: "Oldenburg",
    websiteSummary:
      "Mittelständische Steuerberatungskanzlei aus Oldenburg mit Fokus auf Handwerksbetriebe und kleine bis mittelgroße Unternehmen. 14 Mitarbeitende, 4 Steuerberater. Beratungsspektrum: Jahresabschlüsse, Buchhaltung, Lohn, Existenzgründer. Sucht aktiv Mandanten im Mittelstand.",
    igHandle: "intax.steuerberatung",
    igFollowers: 1240,
    igPosts: 142,
    igBio: "Steuerberatung für Mittelstand & Handwerk · Oldenburg · Wir vereinfachen Steuern.",
    posts: keinevideoPosts([
      "5 typische Fehler bei der Steuererklärung — Karussell mit den Klassikern.",
      "Steuertipps für Handwerksbetriebe 2026 — alle Änderungen kompakt auf 6 Slides.",
      "Frist 31.05. — Einkommensteuererklärung 2024 mit Steuerberater. Reminder.",
      "Existenzgründer:in im ersten Jahr — 7 Slides.",
      "Team-Update: Willkommen Lena Brink — neue Steuerfachangestellte.",
      "Bewirtungsbelege richtig erfassen — 5 Punkte.",
      "Tipp der Woche: Digitale Belegerfassung spart pro Monat ~6 Stunden.",
      "Lohnabrechnung 2026 — Mindestlohn, Beiträge, Abgaben.",
      "Wir suchen Verstärkung: Steuerfachangestellte (m/w/d).",
      "Häusliches Arbeitszimmer absetzen — 8 Slides.",
      "Fristverlängerung Steuererklärung — wann sinnvoll.",
      "Investitionsabzugsbetrag (IAB) — Steuern sparen.",
    ]),
    problem:
      "Postet regelmäßig Karussells und Bilder mit guten Inhalten — aber kein einziges Video. Reels bekommen aktuell deutlich mehr organische Reichweite.",
  }),

  // 3. KEINEVIDEO + branding (Personenmarke)
  buildLead({
    label: "KEINEVIDEO_branding",
    segment: "KEINEVIDEO",
    forceLeadType: "branding",
    forceFocusArea: "organic",
    company: "Dr. Sina Berkemann",
    contactFirst: "Sina",
    contactLast: "Berkemann",
    city: "Bremen",
    websiteSummary:
      "Privatpraxis für ästhetische Hautmedizin in Bremen. Inhaberin Dr. Sina Berkemann, Fachärztin für Dermatologie. Premium-Positionierung, Selbstzahler-Praxis. Behandlungen: Hautanalyse, Anti-Aging, Acne, Schönheitsbehandlungen. Hauptfokus: Aufbau persönlicher Marke und Reichweite über Social Media.",
    igHandle: "dr.sina.berkemann",
    igFollowers: 3800,
    igPosts: 195,
    igBio: "Dr. Sina Berkemann · Hautmedizin Bremen · Aesthetic Dermatology · Wissen, das hält",
    posts: keinevideoPosts([
      "5 Hautmythen die wirklich nicht stimmen — Karussell.",
      "Hautanalyse: Welcher Hauttyp seid ihr? — Bild-Übersicht.",
      "Akne-Routine die funktioniert — 7 Slides Schritt für Schritt.",
      "Praxis-Update: Neuer Behandlungsraum für Lasertherapie. Foto.",
      "Team-Vorstellung: Unsere medizinischen Fachangestellten — Gruppenbild.",
      "Karussell: 4 Anti-Aging-Wirkstoffe mit Studien-Background.",
      "Einblick in einen Behandlungstag — Foto der Eingangshalle.",
      "Karussell: Vorher-Nachher Akne-Therapie (mit Patientin-Einverständnis).",
      "5 Sonnenschutz-Mythen — was Hautärzte wirklich empfehlen.",
      "Praxis-Eröffnung im neuen Standort — Foto.",
      "Karussell: 6 Inhaltsstoffe die in eurer Pflege NICHT sein sollten.",
      "Wissen für die Haut: Microbiom erklärt — 5 Slides.",
    ]),
    problem:
      "Sehr fundierte Inhalte, aber rein als Bild-Karussells. Personenmarke leidet darunter, dass Dr. Berkemann nicht in Bewegung/sprechend zu sehen ist — Vertrauensaufbau läuft auf Instagram fast nur über Reels mit Gesicht.",
  }),

  // 4. INKONSISTENT + recruiting
  buildLead({
    label: "INKONSISTENT_recruiting",
    segment: "INKONSISTENT",
    forceLeadType: "recruiting",
    forceFocusArea: "recruiting",
    company: "Pflegedienst Norderwert",
    contactFirst: "Annika",
    contactLast: "Norderwert",
    city: "Aurich",
    websiteSummary:
      "Ambulanter Pflegedienst aus Aurich mit Schwerpunkt häusliche Alten- und Behindertenpflege. 32 Mitarbeitende, deckt Stadt und Umland ab. Aktuell akuter Personalmangel: 5 offene Stellen für Pflegefachkräfte. Karriereseite mit Anzeigen für Pflegehilfskräfte und examinierte Fachkräfte.",
    igHandle: "pflegedienst.norderwert",
    igFollowers: 920,
    igPosts: 87,
    igBio: "Pflegedienst Norderwert · Aurich · Wir kommen zu euch nach Hause · Wir suchen Pflegefachkräfte",
    posts: inkonsistentPosts([
      "Tag der Pflege — kurzer Beitrag mit Eindrücken aus dem Team.",
      "Reel: Was ein Pflegefachkraft-Tag bei uns wirklich aussieht.",
      "Stellenanzeige: Pflegefachkraft (m/w/d) für Tagdienst in Aurich.",
      "Bild: Geburtstagsfeier einer Patientin — schöner Moment.",
      "Reel: Auto-Übergabe für unsere neue Tour — Sandra startet.",
      "Karussell: 5 Vorteile als Pflegefachkraft bei Norderwert.",
      "Stellenanzeige: Pflegehilfskraft Teilzeit — Quereinsteiger willkommen.",
      "Reel: Frühschicht startet — Briefing am Morgen.",
      "Tipp: Pflegegrad beantragen — Karussell mit den Schritten.",
      "Foto: Team-Frühstück nach langer Schicht.",
      "Reel: Was wir an unserer Arbeit lieben — Stimmen aus dem Team.",
      "Stellenanzeige: Examinierte Pflegefachkraft Vollzeit.",
    ]),
    problem:
      "Posts kommen mal in einer Woche dreimal, dann wieder 3 Wochen Stille. Algorithmus straft das ab. Inhaltlich sind Stellenanzeigen + Reels da, aber die Reichweite kommt nicht in Gang.",
  }),

  // 5. INKONSISTENT + leadgen
  buildLead({
    label: "INKONSISTENT_leadgen",
    segment: "INKONSISTENT",
    forceLeadType: "leadgen",
    forceFocusArea: "meta_ads",
    company: "Fahrschule Kummer",
    contactFirst: "Jonas",
    contactLast: "Kummer",
    city: "Leer",
    websiteSummary:
      "Familienfahrschule aus Leer mit drei Standorten. Klassen B, BE, A1, A2, A. Bietet auch Intensivkurse und Auffrischungsstunden. Hauptzielgruppe: Fahrschüler 17-25 Jahre, Eltern als Entscheider. Sucht aktiv neue Schüler über Social Media.",
    igHandle: "fahrschule.kummer",
    igFollowers: 1430,
    igPosts: 110,
    igBio: "Fahrschule Kummer · Leer · 3 Standorte · Klassen B/BE/A · Intensivkurse möglich",
    posts: inkonsistentPosts([
      "Theorieprüfung bestanden! Glückwunsch an Lina aus dem Mai-Kurs.",
      "Reel: Erste Fahrstunde — was euch erwartet.",
      "Karussell: 7 Mythen über die Theorieprüfung.",
      "Foto: Neuer Fahrlehrer Markus — Vorstellung im Team.",
      "Reel: A-Klasse Crashkurs — Eindrücke vom Wochenende.",
      "Tipp: 5 Sachen die ihr vor der Theorieprüfung noch checken solltet.",
      "Foto: Praxisprüfung — Klara hat bestanden, Glückwunsch!",
      "Reel: Hindernisparcours — wir üben für die Praxisprüfung.",
      "Karussell: Was kostet der Führerschein wirklich? Aufschlüsselung.",
      "Foto: Standort Leer-Loga umgebaut — neue Theorie-Räume.",
      "Reel: Tag der offenen Tür — kommt vorbei!",
      "Karussell: 5 typische Fehler in der Praxisprüfung — und wie ihr sie vermeidet.",
    ]),
    problem:
      "Posting-Rhythmus stark schwankend. Mal mehrere Posts in einer Woche, dann wochenlange Pausen. Reichweite bleibt unter dem Potenzial einer Fahrschule mit 1.400 Followern.",
  }),

  // 6. INKONSISTENT + branding
  buildLead({
    label: "INKONSISTENT_branding",
    segment: "INKONSISTENT",
    forceLeadType: "branding",
    forceFocusArea: "organic",
    company: "Studio LIN",
    contactFirst: "Linda",
    contactLast: "Vogt",
    city: "Hamburg",
    websiteSummary:
      "Junges unabhängiges Streetwear-Label aus Hamburg, gegründet 2024 von Linda Vogt. Limitierte Drops, lokal produzierte Hoodies, Tees, Caps. Premium-Material, Indie-Ästhetik. Hauptkanal Instagram für Markenaufbau und Drop-Ankündigungen.",
    igHandle: "studio.lin.hamburg",
    igFollowers: 2840,
    igPosts: 76,
    igBio: "Studio LIN · Hamburg · Limited Drops · Streetwear made in Germany",
    posts: inkonsistentPosts([
      "Reel: Drop 003 Behind the Scenes — Shooting in Altona.",
      "Foto: Neue Hoodie-Farbe Olive — Detailaufnahme.",
      "Karussell: Drop-Termin und Preisliste für Drop 004.",
      "Reel: Lookbook Snippet — schnell vor dem Sale.",
      "Foto: Ankunft der Lieferung — neue Stoffe.",
      "Karussell: 5 Sachen die uns inspirieren — Moodboard.",
      "Reel: Pop-Up in Sternschanze — Eindrücke vom Wochenende.",
      "Foto: Fan-Pic — Drop 002 in der Wildbahn gesichtet.",
      "Karussell: Sustainable Sourcing — wo unsere Stoffe herkommen.",
      "Reel: Naht-Detail — wir arbeiten mit einer kleinen Manufaktur.",
      "Foto: Studio-Eindruck — wo alles entsteht.",
      "Karussell: Drop 005 — Save the Date.",
    ]),
    problem:
      "Drops, Lookbooks und Behind-the-Scenes wären ein Top-Format für regelmäßige Reels. Aber Veröffentlichung ist sehr stoßartig — direkt vor und nach Drops viel, dann wieder Funkstille. Markenpräsenz leidet unter den Lücken.",
  }),

  // 7. SOLIDE + recruiting
  buildLead({
    label: "SOLIDE_recruiting",
    segment: "SOLIDE",
    forceLeadType: "recruiting",
    forceFocusArea: "recruiting",
    company: "Logistik Niemeyer",
    contactFirst: "Henrik",
    contactLast: "Niemeyer",
    city: "Emden",
    websiteSummary:
      "Mittelständisches Logistik- und Speditionsunternehmen aus Emden mit Fokus auf Hafen-Container-Transport und regionale Distribution. 95 Mitarbeitende, 42 LKW. Hoher Bedarf an LKW-Fahrern (CE), Disponenten und Lager-Mitarbeitenden. Karriereseite mit aktuell 7 Stellenanzeigen.",
    igHandle: "logistik.niemeyer",
    igFollowers: 3650,
    igPosts: 180,
    igBio: "Niemeyer Logistik · Emden · Hafen, Spedition, Lager · Wir suchen LKW-Fahrer (CE)",
    posts: solidePosts([
      "Reel: Hafen Emden bei Sonnenaufgang — Frühschicht.",
      "Reel: Tag im Leben unseres Disponenten Tom.",
      "Reel: Ein Fahrer-Tag in 60 Sekunden.",
      "Reel: Werkstatt-Einblick — wir warten unsere Flotte selbst.",
      "Reel: Bewerbungsprozess in 30 Sekunden erklärt.",
      "Reel: Fahrer-Stimmen — was sie an Niemeyer schätzen.",
      "Reel: Lager-Tour — wo eure Bestellungen umgeschlagen werden.",
      "Reel: Neue Sattelzugmaschine im Fuhrpark.",
      "Reel: Why Emden — was unsere Fahrer an der Region mögen.",
      "Reel: Hinter den Kulissen — Disposition Live.",
      "Reel: Fahrer-Stimme Sven — 15 Jahre dabei.",
      "Reel: Frühschicht-Routine — wie ein Fahrtag startet.",
    ]),
    problem:
      "Account ist organisch sehr stark aufgestellt — Reels funktionieren, Reichweite und Engagement passen. Aber: Bewerbungen kommen organisch nur sehr begrenzt aus der relevanten Zielgruppe (Fahrer 25-45). Recruiting-Ads würden gezielt diese Zielgruppe ansteuern.",
  }),

  // 8. SOLIDE + meta_ads (leadgen)
  buildLead({
    label: "SOLIDE_meta_ads",
    segment: "SOLIDE",
    forceLeadType: "leadgen",
    forceFocusArea: "meta_ads",
    company: "Fitnessstudio Aurica",
    contactFirst: "Sven",
    contactLast: "Hagen",
    city: "Aurich",
    websiteSummary:
      "Premium-Fitnessstudio in Aurich mit Fokus auf Personal Training, Group Fitness und Body Transformation. 8 Trainer, 1.200 Mitglieder. Bietet auch Online-Coaching. Aktuell stabile Auslastung, wachsen aber organisch nicht mehr — neue Mitglieder kommen fast ausschließlich über Empfehlungen.",
    igHandle: "fitness.aurica",
    igFollowers: 5240,
    igPosts: 380,
    igBio: "Fitnessstudio Aurica · Premium Training · Group · PT · Transformation · Aurich",
    posts: solidePosts([
      "Reel: Vorher/Nachher 12 Wochen Body Transformation — mit Kunden-Erlaubnis.",
      "Reel: Group-Class Mittwoch Abend — die Stimmung sagt alles.",
      "Reel: Trainer-Stimme Lisa — wie sie Anfänger abholt.",
      "Reel: 5 Übungen für einen starken Rücken — nachmachen erlaubt.",
      "Reel: Tag in unserem Studio — von 6 bis 22 Uhr.",
      "Reel: Mitglieder-Story Anke (52) — wie sie 14 kg abgenommen hat.",
      "Reel: Personal Training Session — Einblicke.",
      "Reel: 3 typische Anfänger-Fehler im Studio.",
      "Reel: Neuer Functional-Bereich — Tour.",
      "Reel: Trainer-Standpunkt — was Krafttraining nach 50 wirklich bringt.",
      "Reel: Studio-Atmosphäre Sonntag — wir haben offen.",
      "Reel: Mitglieder-Q&A Live — Eindrücke.",
    ]),
    problem:
      "Sehr starker organischer Auftritt mit gutem Engagement und Trust-Aufbau. Aber Reichweite ist gedeckelt — der Algorithmus zeigt Posts hauptsächlich Bestandsmitgliedern und ähnlichen Profilen. Neukunden-Akquise findet aktuell hauptsächlich über Empfehlungen statt, Meta-Ads würden die Decke nach oben verschieben.",
  }),
];

// ────────────────────────────────────────────────────────────────────────────

interface CaseResult {
  label: string;
  leadId: string;
  companyName: string;
  segment: string;
  leadType: string;
  pdfBuffer: Buffer;
  pdfName: string;
  pitchUrl: string;
  caseStudyUsed: string;
}

async function runCase(mock: MockLead): Promise<CaseResult> {
  console.log(`\n🔧 ${mock.label} — ${mock.data.company_name}`);

  // 1. Lead in DB anlegen
  const sanitized = Object.fromEntries(
    Object.entries(mock.data).filter(([k]) => !NON_PROD_COLUMNS.includes(k))
  ) as typeof mock.data;
  const lead = await createLead(sanitized);
  console.log(`   Lead: ${lead.id}`);

  // 2. Opener generieren + PDF rendern (parallel zur Pitch-Generation läuft NICHT,
  //    weil generatePitchPageContent ebenfalls Claude blockiert — wir machen sequentiell)
  console.log(`   ⏳ generateOpener...`);
  const opener = await generateOpener(lead);

  const cs = caseStudyForSegment(lead.segment ?? null)
    ?? CASE_STUDIES.find((c) => c.key === opener.case_study_key)
    ?? matchCaseStudies(mock.forceFocusArea, lead.website_summary ?? "")[0];
  if (!cs) throw new Error(`Keine Case Study für ${mock.label}`);

  console.log(`   ⏳ renderSlidesPdf (Case: ${cs.firmenname})...`);
  const pdfBuffer = await renderSlidesPdf({
    content: {
      slide1_headline: opener.slide1_headline,
      slide1_subline: opener.slide1_subline,
      slide1_bullets: opener.slide1_bullets,
      slide1_these: opener.slide1_these,
    },
    caseStudy: cs,
    meta: { companyName: mock.data.company_name },
  });
  const cleanCompany = mock.data.company_name.replace(/\[TEST\]\s*/, "").replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
  const pdfName = `${mock.label}_${cleanCompany}.pdf`;
  console.log(`   📎 PDF (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

  // 3. Pitch-Seite generieren
  console.log(`   ⏳ generatePitchPageContent (forceLeadType=${mock.forceLeadType}, forceFocusArea=${mock.forceFocusArea})...`);
  const pitchContent = await generatePitchPageContent(lead, {
    forceLeadType: mock.forceLeadType,
    forceFocusArea: mock.forceFocusArea,
  });
  const brancheHint = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
  const matchedCases = matchCaseStudies(pitchContent.focus_area, brancheHint);
  const existing = await getPitchPageByLeadId(lead.id);
  let slug: string;
  if (existing) {
    slug = existing.slug;
  } else {
    slug = generatePitchSlug(lead.company_name);
    await createPitchPage({
      lead_id: lead.id,
      slug,
      status: "published",
      focus_area: pitchContent.focus_area,
      focus_reasoning: pitchContent.focus_reasoning,
      lead_type: pitchContent.lead_type,
      third_card_type: pitchContent.third_card_type,
      platforms: pitchContent.platforms,
      platform_strategy: pitchContent.platform_strategy,
      hero_headline: pitchContent.hero_headline,
      hero_subline_accent: pitchContent.hero_subline_accent,
      hero_text: pitchContent.hero_text,
      hero_meta: pitchContent.hero_meta,
      konzept_blocks: pitchContent.konzept_blocks,
      content_strategie_blocks: null,
      content_examples_branche: brancheHint || null,
      case_studies_keys: matchedCases.map((c) => c.key),
      vorgehen_blocks: pitchContent.vorgehen_blocks,
      cta_headline: pitchContent.cta_headline,
      cta_text: pitchContent.cta_text,
      company_name_display: lead.company_name,
      published_at: new Date().toISOString(),
    });
  }
  const pitchUrl = `${BASE_URL}/p/${slug}`;
  console.log(`   ✅ Pitch: ${pitchUrl}`);

  return {
    label: mock.label,
    leadId: lead.id,
    companyName: mock.data.company_name.replace(/\[TEST\]\s*/, ""),
    segment: mock.segment,
    leadType: mock.forceLeadType,
    pdfBuffer,
    pdfName,
    pitchUrl,
    caseStudyUsed: cs.firmenname,
  };
}

async function main() {
  console.log(`\n🚀 ALL-CASES Test — generiere ${MOCKS.length} Cases\n`);
  const results: CaseResult[] = [];
  for (const mock of MOCKS) {
    try {
      const result = await runCase(mock);
      results.push(result);
    } catch (err) {
      console.error(`   ❌ Fehler bei ${mock.label}:`, err);
    }
  }

  if (results.length === 0) {
    console.error("Keine Cases erfolgreich generiert. Abbruch.");
    process.exit(1);
  }

  // ── Mail 1: Alle PDFs ──────────────────────────────────────────────────
  console.log(`\n📧 Sende Mail mit ${results.length} PDFs...`);
  const pdfListHtml = results
    .map((r, i) => `<li><b>${i + 1}. ${r.label}</b> — ${r.companyName} <span style="color:#888">(Case: ${r.caseStudyUsed})</span></li>`)
    .join("");
  const totalSizeMb = (results.reduce((s, r) => s + r.pdfBuffer.length, 0) / 1024 / 1024).toFixed(2);

  await sendTransactionalEmail({
    to: { email: TO_EMAIL, name: "Niklas" },
    subject: `[ALL-CASES] PDFs für ${results.length} Mock-Leads`,
    htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;">
      <p>Anbei die PDFs für alle ${results.length} Mock-Cases. Gesamtgröße: ${totalSizeMb} MB.</p>
      <ul style="padding-left:20px;">${pdfListHtml}</ul>
      <p>Reihenfolge der Anhänge entspricht der Liste oben. Dateinamen-Schema: <code>{Segment}_{LeadType}_{Firma}.pdf</code></p>
      <p style="color:#888;font-size:13px;">Hinweis: Vorher/Nachher-Layout in Slide 2 ist aktuell nur bei Kreisbahn-Aurich-Organic befüllt → trifft die KEINEVIDEO-Cases. Andere Cases zeigen Slide 2 mit Kurzbeschreibung-Fallback.</p>
    </div>`,
    attachments: results.map((r) => ({ name: r.pdfName, content: r.pdfBuffer })),
  });
  console.log(`   ✅ PDF-Mail gesendet`);

  // ── Mail 2: Alle Pitch-Links ───────────────────────────────────────────
  console.log(`\n📧 Sende Mail mit ${results.length} Pitch-Links...`);
  const linksHtml = results
    .map((r, i) => `
      <li style="margin-bottom:12px;">
        <b>${i + 1}. ${r.label}</b> — ${r.companyName}<br>
        <a href="${r.pitchUrl}" style="color:#0a7a8c;">${r.pitchUrl}</a>
      </li>`)
    .join("");
  await sendTransactionalEmail({
    to: { email: TO_EMAIL, name: "Niklas" },
    subject: `[ALL-CASES] Pitch-Seiten für ${results.length} Mock-Leads`,
    htmlContent: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;">
      <p>Alle ${results.length} Pitch-Seiten sind live unter <code>mail.primesocial.de/p/[slug]</code>:</p>
      <ol style="padding-left:20px;">${linksHtml}</ol>
      <p style="color:#888;font-size:13px;">Alle Test-Leads sind in der DB mit <code>[TEST]</code>-Prefix gespeichert. Können später manuell gelöscht werden.</p>
    </div>`,
  });
  console.log(`   ✅ Pitch-Link-Mail gesendet`);

  console.log(`\n✅ Fertig — ${results.length} Cases erfolgreich, beide Mails an ${TO_EMAIL}.`);
}

main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
