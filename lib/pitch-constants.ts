// ─────────────────────────────────────────────
// Pitch-Page Konstanten
// Fest gepflegte Inhalte, die NICHT von Claude generiert werden.
// Case Studies + Content-Beispiele für Sektion 5 + 6.
// ─────────────────────────────────────────────

// Öffentliche Basis-URL für Pitch-Seiten
export const PITCH_BASE_URL = "https://mail.primesocial.de";

export function buildPitchUrl(slug: string): string {
  return `${PITCH_BASE_URL}/p/${slug}`;
}

// PrimeSocial Brand-Farbe — zentral gepflegt, wird in Pitch-Seiten, Mails und Akzenten verwendet
export const BRAND_COLOR = "#89DFED";
export const BRAND_TEXT_ON_COLOR = "#000000";

// Brand-Gradient für Buttons und Hero-Akzente
// Dunkles Petrol-Cyan zu hellem Brand-Cyan
export const BRAND_GRADIENT_START = "#1F576B";
export const BRAND_GRADIENT_END = "#89DFED";
export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND_GRADIENT_START} 0%, ${BRAND_GRADIENT_END} 100%)`;
export const BRAND_GRADIENT_TEXT = "#FFFFFF";

// ─────────────────────────────────────────────
// Plattformen (v2: keine LinkedIn-Strategie mehr — nur FB/IG/TT)
// ─────────────────────────────────────────────
import type { Platform, PitchLeadType, ThirdCardType } from "@/types";

export const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "facebook",  label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok",    label: "TikTok" },
];

// ─────────────────────────────────────────────
// Plattform-Vergleich (Edukation, keine Lösungs-Pitch)
// Zeigt alle 4 relevanten Plattformen mit Zielgruppe, Stärken, Schwächen.
// In der UI werden die Plattformen aus pitch.platforms visuell hervorgehoben,
// die anderen bleiben dezent. So sieht der Lead sofort: was passt zu mir und
// was sind die Alternativen die wir bewusst NICHT empfehlen.
// ─────────────────────────────────────────────
export type ComparePlatformKey = Platform | "linkedin";

// Lead-Type-Key fuer die Bullets — Mixed faellt auf Recruiting zurueck.
export type PlatformGoodForKey = "recruiting" | "leadgen" | "branding";

export interface PlatformProfile {
  key: ComparePlatformKey;
  name: string;
  audience: string;                                   // Wer ist hier unterwegs (1-2 Sätze)
  goodFor: Record<PlatformGoodForKey, string[]>;      // Wofuer die Plattform pro Lead-Type gut ist
  notFor: string;                                     // Wann sie eher nicht passt (1 Satz)
}

export const PLATFORM_PROFILES: PlatformProfile[] = [
  {
    key: "linkedin",
    name: "LinkedIn",
    audience:
      "Akademisch geprägte Berufstätige, Führungskräfte und IT-/Engineering-Profile. Aktive Job-Suchende und passiv Wechselbereite mischen sich in fast gleichem Verhältnis.",
    goodFor: {
      recruiting: [
        "Recruiting für Ingenieure, IT, Vertrieb, Management",
        "Employer-Branding für Konzern- und Mittelstands-Jobs",
        "Direkter Zugang zu passiv Wechselbereiten",
      ],
      leadgen: [
        "B2B-Leads, hochpreisige Beratung und Software",
        "Entscheider in Konzernen und Mittelstand direkt ansprechen",
        "Thought-Leadership-Posts für Vertrauen vor dem Erstkontakt",
      ],
      branding: [
        "Personal Brand für Geschäftsführung und Experten",
        "Fachliche Sichtbarkeit in Ihrer Industrie",
        "Netzwerk-Aufbau mit Multiplikatoren und Branchenkollegen",
      ],
    },
    notFor:
      "Handwerk, Service, Gastronomie, Logistik. Diese Zielgruppen sind hier kaum aktiv.",
  },
  {
    key: "facebook",
    name: "Facebook",
    audience:
      "Erwachsene zwischen 30 und 60, lokal verwurzelt, oft mit Familie und festem Beruf. Genau die Demografie, die bei Wechsel-Themen länger nachdenkt bevor sie reagiert.",
    goodFor: {
      recruiting: [
        "Recruiting für Handwerk, Pflege, Industrie, Verwaltung",
        "Passiv Wechselbereite ab 30 erreichen",
        "Geo-Targeting auf Ihre Region und Umkreis",
      ],
      leadgen: [
        "Lokale Kunden gewinnen mit präzisem Geo-Targeting",
        "30-60-Jährige mit Kaufkraft direkt ansprechen",
        "Konversions-Kampagnen mit messbaren Anfragen",
      ],
      branding: [
        "Lokale Bekanntheit in Ihrer Region aufbauen",
        "Vertrauen bei der älteren Erwerbsbevölkerung",
        "Pflege einer treuen Community aus Bestandskunden",
      ],
    },
    notFor:
      "Junge Zielgruppen unter 25. Die sind hier kaum noch aktiv.",
  },
  {
    key: "instagram",
    name: "Instagram",
    audience:
      "Erwachsene zwischen 22 und 45, optisch geprägt, mit hoher Aufmerksamkeit für Lifestyle, Beruf und Authentizität. Reels werden algorithmisch massiv an Nicht-Follower ausgespielt.",
    goodFor: {
      recruiting: [
        "Recruiting für alle Branchen mit Bildsprache (Handwerk, Gastro, Beauty, Medizin)",
        "Reichweite an neue Bewerber-Zielgruppen über Reels",
        "Echte Gesichter und Werkstatt-Einblicke statt Stockfotos",
      ],
      leadgen: [
        "Direkt-Anfragen über Reels an Nicht-Follower",
        "Visuelle Branchen wie Beauty, Gastro, Lifestyle, Handwerk",
        "Klare Funnels mit Story-Stickern, Buttons und DMs",
      ],
      branding: [
        "Markenaufbau und Wiedererkennung über Gesichter",
        "Reichweite an neue Zielgruppen über Reels",
        "Authentizität und Lifestyle-Image zeigen",
      ],
    },
    notFor:
      "Reine Text-/B2B-Themen ohne visuelle Story.",
  },
  {
    key: "tiktok",
    name: "TikTok",
    audience:
      "Sehr jung bis Anfang 30, extrem trend-getrieben und kurze Aufmerksamkeitsspannen. Wer hier wirkt, wirkt schnell und groß. Wer nicht, geht spurlos unter.",
    goodFor: {
      recruiting: [
        "Recruiting für Azubis, Quereinsteiger, junge Berufseinsteiger",
        "Reichweiten-Explosionen bei viral-tauglichen Themen",
        "Arbeitgeber-Persönlichkeit mit klar erkennbarem Ton",
      ],
      leadgen: [
        "Junge Zielgruppen unter 30 zum ersten Kauf bewegen",
        "Edukation und Vertrauen über Kurzvideos",
        "Sehr günstige Reichweite für viral-taugliche Produkte",
      ],
      branding: [
        "Personality-Brand aufbauen mit klarer Tonalität",
        "Bekanntheit bei der nächsten Kunden-Generation",
        "Reichweiten-Explosionen bei viral-tauglichen Themen",
      ],
    },
    notFor:
      "Hochpreisige B2B-Leads, ältere Kernzielgruppen, klassischer Mittelstand.",
  },
];

// Helper: gibt die passenden goodFor-Bullets fuer einen Lead-Type zurueck.
// Mixed -> Recruiting als Default; null -> Recruiting als Default.
export function platformGoodForByLeadType(
  profile: PlatformProfile,
  leadType: PitchLeadType | null,
): string[] {
  const key: PlatformGoodForKey =
    leadType === "leadgen" ? "leadgen" :
    leadType === "branding" ? "branding" :
    "recruiting";
  return profile.goodFor[key];
}

// Lead-Typ → menschlich lesbares Label (für Dashboard-Spalte und CTA-Generation)
export const LEAD_TYPE_LABELS: Record<PitchLeadType, string> = {
  recruiting: "Recruiting",
  leadgen:    "Kundengewinnung",
  branding:   "Markenaufbau",
  mixed:      "Gemischt",
};

// ─────────────────────────────────────────────
// Vorgehen — Customer Journey, handgepflegt fuer Konsistenz.
// Bewusst generisch gehalten (kein Lead-spezifisches Personal-Setup), aber mit
// klarem Ton. Wird in PitchContent statt pitch.vorgehen_blocks gerendert.
// ─────────────────────────────────────────────
export const VORGEHEN_BLOCKS: { zeitraum: string; titel: string; bullets: string[] }[] = [
  {
    zeitraum: "Woche 1-2",
    titel: "Onboarding und Konzept",
    bullets: [
      "Kick-off-Gespräch: Wir lernen Sie, Ihre Themen und Ihre Ziele kennen",
      "Content-Strategie aus Ihrem Tagesgeschäft entwickeln",
      "Drehtag-Termine, Themen und Formate festlegen",
      "Werbeanzeigen-Konto einrichten mit Targeting für Ihre Region",
    ],
  },
  {
    zeitraum: "Woche 2-3",
    titel: "Produktion und Feinschnitt",
    bullets: [
      "Drehtag bei Ihnen vor Ort",
      "Aufnahmen von Arbeitsprozessen, Projekten und Menschen",
      "Schnitt der ersten Videos für Ihre Plattformen",
      "Begleitenden Online-Auftritt aufsetzen (Karriereseite oder Landingpage)",
    ],
  },
  {
    zeitraum: "Ab Woche 3, fortlaufend",
    titel: "Veröffentlichung und Optimierung",
    bullets: [
      "Regelmäßige Posts auf den vereinbarten Plattformen",
      "Werbeanzeigen schalten und wöchentlich optimieren",
      "Eingänge tracken. Was wirkt, bauen wir aus",
      "Monatliche Nachproduktion mit frischem Content",
    ],
  },
];

// Third-Card-Typ → Titel der dritten Konzept-Karte je Lead-Typ
export const THIRD_CARD_LABELS: Record<ThirdCardType, string> = {
  career_page:  "Karriereseite",
  landing_page: "Landingpage",
  community:    "Community-Aufbau",
  visibility:   "Sichtbarkeit",
};

// Standard-Mapping Lead-Typ → Third-Card-Typ (Claude darf abweichen, aber das ist die Default-Erwartung)
export const DEFAULT_THIRD_CARD_BY_LEAD_TYPE: Record<PitchLeadType, ThirdCardType> = {
  recruiting: "career_page",
  leadgen:    "landing_page",
  branding:   "community",
  mixed:      "visibility",
};

// Subtle CTA-Headline Default je Lead-Typ (wird von Claude genutzt, falls kein eigener gewählt wird)
export const DEFAULT_CTA_BY_LEAD_TYPE: Record<PitchLeadType, string> = {
  recruiting: "Bereit, Ihr Team zu verstärken?",
  leadgen:    "Bereit, neue Kunden zu gewinnen?",
  branding:   "Bereit für mehr Sichtbarkeit?",
  mixed:      "Bereit, loszulegen?",
};

// ─────────────────────────────────────────────
// Google-Reviews-Seed (echte Bewertungen)
// Wird einmalig per Script in google_reviews geschrieben, danach in der DB gepflegt.
// ─────────────────────────────────────────────
export interface GoogleReviewSeed {
  reviewer_name: string;
  reviewer_image_url: string | null;
  review_text: string;
  rating: number;
  review_date: string; // ungefähres ISO-Datum
  display_order: number;
}

export const GOOGLE_REVIEWS_SEED: GoogleReviewSeed[] = [
  {
    reviewer_name: "Soldatenwissen",
    reviewer_image_url: "/reviews/Soldatenwissen.png",
    review_text:
      "Die Jungs betreuen meine Meta Ads jetzt seit rund drei Monaten und ich bin wirklich zufrieden. Ich hatte vorher schon selbst Ads geschaltet, aber in dieser kurzen Zeit konnten die Leadpreise halbiert werden. Besonders gut gefallen mir ihre Ideen für neue Videos und Beiträge. Man merkt einfach, dass sie mit echter Leidenschaft bei der Sache sind.",
    rating: 5,
    review_date: "2025-11-25",
    display_order: 10,
  },
  {
    reviewer_name: "Wael Debbech",
    reviewer_image_url: null,
    review_text:
      "Die Jungs haben ein Video für das TheAsh Restaurant gemacht und es hat auf Instagram über 100.000 Aufrufe bekommen, auf TikTok sogar fast 300.000. Richtig starkes Ergebnis und das Video sieht einfach top aus. Danke für die gute Arbeit!",
    rating: 5,
    review_date: "2025-04-25",
    display_order: 20,
  },
  {
    reviewer_name: "Dr. Med. Larisa Pfahl",
    reviewer_image_url: "/reviews/Dr-Larisa-Pfahl.png",
    review_text:
      "Max und Niklas begleiten mich jetzt seit einiger Zeit, und durch ihre Arbeit ist mein Account nicht nur professioneller, sondern auch deutlich sichtbarer geworden. Ich bin wirklich dankbar und kann die beiden nur empfehlen!",
    rating: 5,
    review_date: "2025-04-25",
    display_order: 30,
  },
  {
    reviewer_name: "Haus Klaus",
    reviewer_image_url: null,
    review_text:
      "Die tolle Zusammenarbeit war absolut reibungslos und professionell. Unsere Ferienwohnung auf Norderney wurde kreativ, stilvoll und sehr hochwertig in Szene gesetzt. Alles lief schnell, zuverlässig und mit einem besonderen Gespür für Details. Die Kommunikation war durchgehend respektvoll und prompt, jeder Wunsch wurde ernst genommen und mit Herz umgesetzt. Wirklich sehr zu empfehlen!",
    rating: 5,
    review_date: "2025-07-25",
    display_order: 40,
  },
  {
    reviewer_name: "Mariana Chiaravalloti",
    reviewer_image_url: null,
    review_text:
      "Wir sind super dankbar für das tolle Video! Besser hätte es nicht werden können, es war eine sehr schöne Zusammenarbeit und hat eine Riesen Reichweite erreicht! Wer also interessiert an einem super Video und einer großen Reichweite ist, sollte hier nicht lange zögern! Vielen vielen Dank euch nochmal!:)",
    rating: 5,
    review_date: "2025-09-25",
    display_order: 50,
  },
];

export const CALENDLY_URL = "https://calendly.com/niklas-primesocial/15min";

export const CONTACT = {
  name: "Niklas",
  email: "niklas@primesocial.de",
  phone: "0162 4035041",
  phoneInternational: "+491624035041",
} as const;

// Pfad zur Referenzen-Anfrage-Seite für einen Pitch (leitet auf /r/[slug])
export function buildReferencesUrl(slug: string): string {
  return `/r/${slug}`;
}

// ─────────────────────────────────────────────
// Fokus-Bereiche
// Jede Pitch-Seite hat EINEN Hauptfokus. Die Case Studies in Sektion 6
// stammen aus diesem Bereich. Die anderen zwei Bereiche werden in einer
// kleineren Sektion "Was wir außerdem anbieten" erwähnt.
// ─────────────────────────────────────────────
export type PitchFocusArea = "recruiting" | "meta_ads" | "organic";

export interface FocusAreaEntry {
  key: PitchFocusArea;
  title: string;
  description: string;
  // Erweitert: 3 konkrete Punkte was in dem Bereich passiert (für „Was wir außerdem anbieten")
  highlights: string[];
}

export const FOCUS_AREAS: FocusAreaEntry[] = [
  {
    key: "recruiting",
    title: "Mitarbeitergewinnung",
    description:
      "Für Unternehmen, deren wichtigste Wachstumsbremse fehlende Mitarbeiter sind. Wir bauen einen Bewerberfluss auf, der unabhängig von Stellenportalen funktioniert.",
    highlights: [
      "Content-Formate die zeigen wie es bei Ihnen tatsächlich aussieht",
      "Meta-Ads mit Targeting auf passiv Wechselbereite in Ihrer Region",
      "Karriereseite mit Bewerbungs-Flow ohne 15 Pflichtfelder",
    ],
  },
  {
    key: "meta_ads",
    title: "Meta-Werbeanzeigen",
    description:
      "Für Unternehmen, deren bestes organisches Material zu wenig Reichweite bekommt. Wir bringen Ihren Content gezielt vor die Leute die Sie noch nicht kennen.",
    highlights: [
      "Bestehender Content wird zu skalierbaren Anzeigen weitergedacht",
      "Funnel mit Retargeting für Interessenten die noch nicht entschieden sind",
      "Wöchentliche Auswertung welche Anzeigen wirken und welche nicht",
    ],
  },
  {
    key: "organic",
    title: "Organisches Wachstum",
    description:
      "Für Unternehmen, deren Marke langfristig aufgebaut werden soll. Statt einzelner viraler Posts ein stabiles Format das jede Woche funktioniert.",
    highlights: [
      "Wöchentlicher Posting-Rhythmus den Sie ohne uns weiterführen können",
      "Wiedererkennbare Bildsprache und Tonalität statt zufälliger Posts",
      "Themen-Setzung statt Trend-Hinterherlauferei",
    ],
  },
];

// ─────────────────────────────────────────────
// Case Studies (fix, Sektion 6)
// ─────────────────────────────────────────────
export interface CaseStudyMetric {
  value: string;
  label: string;
}

export interface CaseStudyVideo {
  thumbnailUrl: string;
  caption?: string;
  instagramUrl?: string;
}

export interface CaseStudy {
  key: string;
  focus_area: PitchFocusArea;
  branche: string;
  typ: string;
  firmenname: string;
  kurzbeschreibung: string;
  // heroImage ist ein einzelnes Hero-Bild (z.B. gestapelte Video-Thumbnails als PNG).
  // Wenn gesetzt, wird es statt der videos[]-Platzhalter angezeigt.
  heroImage?: string;
  videos: CaseStudyVideo[];
  metrics: CaseStudyMetric[];
  branchen_tags: string[];
  // Optionales Vorher/Umsetzung/Nachher — wird in der PDF-Slide-2 ausgespielt
  // wenn alle drei Felder vorhanden sind. Sonst fällt die Slide auf kurzbeschreibung zurück.
  vorher?: string;
  umsetzung?: string;
  nachher?: string;
  // Welche Segmente bekommen DIESEN Case bevorzugt (für Pattern-Match, nicht Branchen-Match)?
  // Beispiel: kreisbahn-aurich-organic ist der ideale KEINEVIDEO-Case (Bilder→Reels).
  preferred_for_segments?: string[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    key: "stadtwerke-wilhelmshaven",
    focus_area: "recruiting",
    branche: "Öffentlicher Nahverkehr",
    typ: "Busfahrer-Recruiting",
    firmenname: "Stadtwerke Wilhelmshaven",
    kurzbeschreibung:
      "Vorher viel auf Print-Anzeigen gesetzt, ohne nennenswerten Rücklauf. Über eine Empfehlung zu uns gekommen. Mit gezielten Meta-Anzeigen 101 Anfragen für zwei offene Busfahrer-Stellen, am Ende beide besetzt.",
    heroImage: "/pitch/examples/Stadtwerke-Wilhelmshaven.png",
    videos: [],
    metrics: [
      { value: "101", label: "Bewerbungen" },
      { value: "2 von 2", label: "Stellen besetzt in 3 Monaten" },
      { value: "4,45 €", label: "Werbebudget pro Bewerbung" },
    ],
    branchen_tags: ["nahverkehr", "transport", "verkehr", "bus", "recruiting", "stadtwerke"],
  },
  {
    key: "kreisbahn-aurich",
    focus_area: "recruiting",
    branche: "Öffentlicher Nahverkehr",
    typ: "Werkstatt-Recruiting",
    firmenname: "Kreisbahn Aurich",
    kurzbeschreibung:
      "Vorher Print-Anzeigen und klassische Jobportale, kaum Reichweite bei den richtigen Bewerbern. Über eine Empfehlung zu uns gekommen. Mit Meta-Anzeigen 77 Anfragen für vier Kfz-Mechatroniker-Stellen, alle besetzt.",
    heroImage: "/pitch/examples/Kreisbahn-Aurich.png",
    videos: [],
    metrics: [
      { value: "77", label: "Bewerbungen" },
      { value: "4 von 4", label: "Stellen besetzt in 4 Monaten" },
      { value: "8,74 €", label: "Werbebudget pro Bewerbung" },
    ],
    branchen_tags: ["nahverkehr", "werkstatt", "kfz", "mechatroniker", "handwerk", "recruiting"],
  },
  {
    key: "dr-lara-pfahl",
    focus_area: "organic",
    branche: "Gesundheitswesen",
    typ: "Personal Branding",
    firmenname: "Dr. Lara Pfahl",
    kurzbeschreibung:
      "Kompletten Social-Media-Auftritt strategisch ausgebaut. Die Praxis gewinnt heute einen Großteil neuer Patienten ausschließlich über Social Media.",
    vorher:
      "Praxis-Profil mit 10k Followern, aber unregelmäßig gepflegt und ohne Strategie. Reichweite stagnierte seit Monaten. Neue Patienten kamen fast nur über Bestandsempfehlungen — gut, aber nicht skalierbar.",
    umsetzung:
      "Strategie mit klaren Content-Säulen aufgesetzt: Aufklärung, Persönlichkeit, Patienten-Cases. Wöchentliche Reels mit echten Behandlungs-Storys und Personality-Inhalte zu Dr. Pfahl selbst. Konsistent über 12 Monate durchgezogen.",
    nachher:
      "Von 10k auf 40k Follower in 12 Monaten. Einzelne Reels über 1,4 Mio. Views. Der Großteil neuer Patienten kommt heute direkt über Social Media — ohne einen Euro Werbebudget.",
    heroImage: "/pitch/examples/Dr.Lara-Seite.png",
    videos: [],
    metrics: [
      { value: "10k → 40k", label: "Follower-Wachstum" },
      { value: "1,4 Mio.", label: "Views auf einem Video" },
    ],
    branchen_tags: ["gesundheit", "medizin", "arzt", "praxis", "personal branding", "beauty"],
  },
  {
    key: "kreisbahn-aurich-organic",
    focus_area: "organic",
    branche: "Öffentlicher Nahverkehr",
    typ: "Bilder → Reels",
    firmenname: "Kreisbahn Aurich",
    kurzbeschreibung:
      "Alte Agentur abgelöst, die nur statische Fotos ohne Strategie veröffentlicht hat. Seitdem 4 authentische Reels pro Monat aus dem Alltag mit Bussen, Fahrern und Werkstatt. Reichweite und Engagement haben sich deutlich entwickelt.",
    vorher:
      "Statische Fotos und Karussells vom Tagesgeschäft, gepostet von einer Agentur ohne Branchenkenntnis. Zwischen 200 und 800 Views pro Post, kaum Reaktionen aus dem Umfeld, keine Bewerber-Anfragen über Instagram.",
    umsetzung:
      "Format komplett auf authentische Reels umgestellt, gedreht im Alltag mit den eigenen Leuten. Busfahrer-Stimmen, Werkstatt-Einblicke, hinter den Kulissen. 4 Reels pro Monat, immer aus echten Situationen, keine Inszenierung.",
    nachher:
      "Engagement hat sich verdoppelt, einzelne Reels über 75.000 Views. Reichweite kommt jetzt aus der eigenen Region, wo die echten Bewerber und Bestandskunden sitzen. Bewerbungen kommen mittlerweile direkt über DMs.",
    heroImage: "/pitch/examples/Kreisbahn-Aurich-Organic.png",
    videos: [],
    metrics: [
      { value: "2x", label: "Engagement verdoppelt" },
      { value: "75.200", label: "Views auf einem Reel" },
      { value: "4 / Monat", label: "authentische Reels" },
    ],
    branchen_tags: ["nahverkehr", "transport", "verkehr", "content", "organisch", "handwerk"],
    preferred_for_segments: ["KEINEVIDEO"],
  },
  {
    key: "soldatenwissen",
    focus_area: "meta_ads",
    branche: "Versicherungen",
    typ: "Performance Ads",
    firmenname: "Soldatenwissen",
    kurzbeschreibung:
      "Vorher mit einer Agentur, die einmalig eine Kampagne aufgesetzt und sich auf hohem Retainer ausgeruht hat. Teure Leads, keine Anpassungen. Wir testen kontinuierlich neue Visuals und optimieren laufend. Der Leadpreis hat sich gedrittelt.",
    vorher:
      "Eine Agentur hatte einmalig eine Meta-Kampagne aufgesetzt und kassierte hohen Retainer ohne Anpassungen. Leadpreis stagnierte bei knapp 60 €, dieselben Anzeigen liefen monatelang weiter.",
    umsetzung:
      "Wöchentlich neue Visuals und Hooks getestet, kalte und warme Audiences sauber getrennt, kontinuierlich nachgesteuert. Statt Monatsbericht laufende Optimierung im Account.",
    nachher:
      "Leadpreis auf 19,18 € gedrittelt. Bei 14.000 € Budget kommen 730+ qualifizierte Leads pro Monat rein. Skalierung jetzt nur noch durch Sales-Kapazität limitiert.",
    heroImage: "/pitch/examples/Soldatenwissen.png",
    videos: [],
    metrics: [
      { value: "14.000 €", label: "Ad Spend pro Monat" },
      { value: "730+", label: "Leads pro Monat" },
      { value: "19,18 €", label: "Kosten pro Anfrage" },
    ],
    branchen_tags: ["versicherung", "finanzdienstleistung", "beratung", "b2c", "lead generation"],
  },
  {
    key: "vam-fahrschule",
    focus_area: "meta_ads",
    branche: "Fahrschule",
    typ: "Kursauslastung",
    firmenname: "VAM",
    kurzbeschreibung:
      "Vorher waren BKF-Kurse und einzelne Führerschein-Klassen häufig nicht voll besetzt. Mit gezielten Meta-Anzeigen kommen jetzt konstant Anfragen für mehrere Klassen, die Kurse sind durchgängig ausgelastet.",
    heroImage: "/pitch/examples/VAM.png",
    videos: [],
    metrics: [
      { value: "900 €", label: "Werbebudget pro Monat" },
      { value: "97", label: "Leads pro Monat" },
      { value: "9,28 €", label: "Kosten pro Anfrage" },
    ],
    branchen_tags: ["fahrschule", "ausbildung", "bkf", "fuehrerschein", "transport", "dienstleister"],
  },
];

// Bevorzugter Case pro Segment — Pattern-Match (nicht Branchen-Match).
// Beispiel: KEINEVIDEO-Lead bekommt IMMER den Kreisbahn-Organic-Case (Bilder→Reels-Story),
// unabhängig von der Branche, weil das Vorher/Nachher-Muster perfekt passt.
export function caseStudyForSegment(segment: string | null | undefined): CaseStudy | null {
  if (!segment) return null;
  return CASE_STUDIES.find((cs) => cs.preferred_for_segments?.includes(segment)) ?? null;
}

// Lead-Type → Focus-Area Mapping: bestimmt welche Cases zu welchem Lead-Type passen.
// branding (organisch) ist der universelle Fallback fuer "mixed".
const LEAD_TYPE_TO_FOCUS_AREA: Record<import("@/types").PitchLeadType, PitchFocusArea> = {
  recruiting: "recruiting",
  leadgen:    "meta_ads",
  branding:   "organic",
  mixed:      "organic",
};

// Case-Study-Auswahl mit Lead-Type-Awareness + Branchen-Score.
// Garantiert: Gibt IMMER einen Case zurueck, der zur focus_area des Lead-Types
// passt. Bei mehreren Treffern wird der mit dem besten Branchen-Score bevorzugt.
export function caseStudyForLeadType(
  leadType: import("@/types").PitchLeadType,
  branche?: string | null,
): CaseStudy {
  const focusArea = LEAD_TYPE_TO_FOCUS_AREA[leadType];
  const inFocus = CASE_STUDIES.filter((cs) => cs.focus_area === focusArea);
  if (inFocus.length === 0) return CASE_STUDIES[0]; // Notbremse, sollte nie greifen

  const lowered = (branche ?? "").toLowerCase();
  const sorted = [...inFocus].sort((a, b) => {
    const sA = a.branchen_tags.reduce((acc, t) => (lowered.includes(t) ? acc + 1 : acc), 0);
    const sB = b.branchen_tags.reduce((acc, t) => (lowered.includes(t) ? acc + 1 : acc), 0);
    return sB - sA;
  });
  return sorted[0];
}

// Universelle Case-Study-Auswahl mit 3-stufigem Fallback:
//   1. Segment-Pattern-Match (z.B. KEINEVIDEO → Kreisbahn-Organic)
//   2. Claude's Vorschlag — aber nur wenn der zum Lead-Type passt (focus_area check)
//   3. Lead-Type-aware Branchen-Match (caseStudyForLeadType)
// Gibt IMMER einen Case zurueck.
export function chooseCaseStudy(args: {
  segment?: string | null;
  leadType: import("@/types").PitchLeadType;
  branche?: string | null;
  claudeSuggestedKey?: string | null;
}): CaseStudy {
  const segmentMatch = caseStudyForSegment(args.segment ?? null);
  if (segmentMatch) return segmentMatch;

  const expectedFocus = LEAD_TYPE_TO_FOCUS_AREA[args.leadType];
  if (args.claudeSuggestedKey) {
    const claudeCs = CASE_STUDIES.find((c) => c.key === args.claudeSuggestedKey);
    if (claudeCs && claudeCs.focus_area === expectedFocus) return claudeCs;
  }

  return caseStudyForLeadType(args.leadType, args.branche);
}

// Matching: gibt bis zu 2 Case Studies aus dem gewählten Fokusbereich zurück.
// Wenn weniger als 2 verfügbar sind, füllt die Lücken mit Case Studies aus
// anderen Bereichen (Fallback), damit die Sektion nie leer ist.
export function matchCaseStudies(focusArea: PitchFocusArea | null | undefined, branche?: string | null): CaseStudy[] {
  const inFocus = focusArea ? CASE_STUDIES.filter((cs) => cs.focus_area === focusArea) : [];
  const others = CASE_STUDIES.filter((cs) => cs.focus_area !== focusArea);

  const lowered = (branche ?? "").toLowerCase();
  const sortByBranche = (arr: CaseStudy[]) =>
    [...arr].sort((a, b) => {
      const scoreA = a.branchen_tags.reduce((acc, t) => (lowered.includes(t) ? acc + 1 : acc), 0);
      const scoreB = b.branchen_tags.reduce((acc, t) => (lowered.includes(t) ? acc + 1 : acc), 0);
      return scoreB - scoreA;
    });

  const ranked = [...sortByBranche(inFocus), ...sortByBranche(others)];
  return ranked.slice(0, 2);
}

// ─────────────────────────────────────────────
// Content Examples (Sektion 5: "So sieht organischer Content aus")
// Branchenbezogen, max. 2 Beispiele je Pitch-Seite.
// ─────────────────────────────────────────────
export interface ContentExample {
  key: string;
  branche: string;       // z.B. "Handwerk"
  firmenname: string;    // z.B. "Mußwessels"
  thumbnailUrl: string;
  instagramUrl: string;
  caption: string;
  stats?: { label: string; value: string }[];
  branchen_tags: string[];
}

// NOTE: Echte Inhalte werden gepflegt, sobald Niklas die URLs liefert.
// Bis dahin nutzen wir die Case-Study-Videos als Best-Of-Fallback.
export const CONTENT_EXAMPLES: ContentExample[] = [
  {
    key: "musswessels-handwerk",
    branche: "Handwerk",
    firmenname: "Mußwessels",
    thumbnailUrl: "/pitch/examples/musswessels.jpg",
    instagramUrl: "https://instagram.com/",
    caption: "Authentische Einblicke in den Arbeitsalltag",
    stats: [{ label: "Views", value: "—" }],
    branchen_tags: ["handwerk", "bau", "metallbau", "handwerksbetrieb"],
  },
  {
    key: "vam-recruiting",
    branche: "Handwerk",
    firmenname: "VAM",
    thumbnailUrl: "/pitch/examples/vam.jpg",
    instagramUrl: "https://instagram.com/",
    caption: "Recruiting-Content mit Wiedererkennungswert",
    stats: [{ label: "Views", value: "—" }],
    branchen_tags: ["handwerk", "metall", "produktion", "recruiting"],
  },
  {
    key: "homann-immobilien",
    branche: "Immobilien",
    firmenname: "Homann",
    thumbnailUrl: "/pitch/examples/homann.jpg",
    instagramUrl: "https://instagram.com/",
    caption: "Makler-Content mit persönlicher Note",
    stats: [{ label: "Views", value: "—" }],
    branchen_tags: ["immobilien", "makler", "bau"],
  },
];

// Matching: gibt bis zu 2 Content-Beispiele zurück, die zu einer Branche passen
export function matchContentExamples(branche: string | null | undefined): ContentExample[] {
  if (!branche || CONTENT_EXAMPLES.length === 0) return CONTENT_EXAMPLES.slice(0, 2);
  const lowered = branche.toLowerCase();
  const scored = CONTENT_EXAMPLES.map((ex) => ({
    ex,
    score: ex.branchen_tags.reduce((acc, tag) => (lowered.includes(tag) ? acc + 1 : acc), 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  // Falls alle Score 0 haben → die ersten zwei als Fallback
  if (scored.every((s) => s.score === 0)) return CONTENT_EXAMPLES.slice(0, 2);
  return scored.slice(0, 2).map((s) => s.ex);
}

// ─────────────────────────────────────────────
// Helper: Slug-Generator
// ─────────────────────────────────────────────
export function generatePitchSlug(companyName: string): string {
  const base = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "firma";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

// ─────────────────────────────────────────────
// Typische Fehler pro Lead-Type
// Wird in Sektion 3 der Pitch-Seite angezeigt — Pain-Awareness vor Lösung.
// Inhalte handgepflegt (keine Claude-Generation), damit Qualität konstant ist.
// ─────────────────────────────────────────────
export interface TypicalMistake {
  title: string;        // 4-7 Wörter, klarer Hammer-Satz
  description: string;  // 1-2 Sätze, was daran konkret problematisch ist
}

export interface TypicalMistakesBlock {
  headline: string;
  subline: string;
  mistakes: TypicalMistake[];
}

export const TYPICAL_MISTAKES_BY_LEAD_TYPE: Record<PitchLeadType, TypicalMistakesBlock> = {
  recruiting: {
    headline: "Typische Fehler beim Mitarbeiter-Finden",
    subline:
      "Die besten Leute suchen nicht aktiv. Sie haben einen Job, sind dort aber oft längst unzufrieden. Trotzdem zu eingebunden, um sich auf Stellenportalen umzusehen. Wer klassisch ausschreibt, erreicht damit nur die, die ohnehin schon aktiv suchen. Und das ist selten die A-Liga.",
    // Copywriting-Regeln (gelten fuer alle Pain-Point-Texte):
    //  1. Titel ist Haltung, kein Etikett — direkte Aussage, leicht provokant.
    //  2. Konkrete Zahlen, konkrete Plattform-Namen, konkrete Szenarien.
    //  3. Erzaehlung statt Lehrbuch — kleine Szenen die der Leser miterleben kann.
    //  4. Lockerer, fast muendlicher Ton — kein Marketing-Sprech.
    //  5. Direkte Du/Ihr-Anrede mit Provokation.
    //  6. Branchen-Vokabular (Geselle, Werkstatt, Baustelle, Monteur, …).
    //  7. Konkrete Konsequenz statt abstrakter Erklaerung.
    mistakes: [
      {
        title: "Sie suchen dort, wo keiner sucht",
        description:
          "85 % der guten Handwerker schauen nie auf Stepstone. Die scrollen abends durch Instagram. Ihre Stellenanzeige? Steht seit 4 Monaten online. Und die einzige Bewerbung kam von jemandem ohne Führerschein.",
      },
      {
        title: `„Teamplayer mit Eigeninitiative" sagt keiner Sau was`,
        description:
          "Jede Stellenanzeige klingt gleich. Gesellenbrief, Berufserfahrung, Teamfähigkeit. Fertig. Ihr Betrieb hat eine Geschichte, eine Stimmung, einen Grund warum Leute bleiben. Aber das steht nirgends.",
      },
      {
        title: "Ihre Website zeigt Projekte, aber nicht die Leute dahinter",
        description:
          "Bewerber wollen wissen: Wer steht da neben mir auf der Baustelle? Wie sieht die Werkstatt aus? Stockfotos vom lachenden Handwerker mit sauberem Hemd kauft keiner. Echte Gesichter schlagen jedes Hochglanz-Bild.",
      },
      {
        title: "Ihr Formular schreckt mehr ab als jede Absage",
        description:
          "Ein Geselle kommt abends von der Baustelle, sieht Ihre Anzeige, klickt drauf. Und soll jetzt Anschreiben hochladen, Lebenslauf formatieren und drei Referenzen angeben. Der macht das Handy aus und Sie hören nie wieder von ihm.",
      },
      {
        title: `„Wir suchen Verstärkung". Ja und?`,
        description:
          "Das interessiert den Bewerber null. Der will wissen: Was verdien ich? Wie sind die Arbeitszeiten? Kann ich freitags um 14 Uhr Feierabend machen? Wer das nicht beantwortet, verliert gegen den Betrieb der's tut.",
      },
      {
        title: "Der beste Monteur war vorher Schreiner",
        description:
          `In jedem Handwerk gibt's Leute aus Nachbar-Gewerken, die Bock auf was Neues haben. Aber wenn in Ihrer Anzeige „Gesellenbrief XY zwingend erforderlich" steht, meldet sich keiner von denen. Und Sie wundern sich, warum die Stelle seit Monaten offen ist.`,
      },
    ],
  },
  leadgen: {
    headline: "Typische Fehler bei der Kundengewinnung",
    subline:
      "Reichweite zu erzeugen ist heute günstig. 100.000 Impressionen für ein paar Euro sind kein Kunststück mehr. Daraus echte Anrufe und Termine zu machen, das schaffen nur wenige. Die meisten verbrennen Werbebudget, weil sie Klicks nicht in Kunden übersetzen können.",
    mistakes: [
      {
        title: "Sie reden mit allen und damit mit niemandem",
        description:
          "Ihre Anzeige läuft — aber wer sieht sie? Rentner, Studenten, Leute 200 km entfernt. Wenn von 1.000 Klicks drei echte Anfragen kommen, liegt das nicht am Budget. Es liegt daran, dass Ihre Werbung bei den Falschen landet.",
      },
      {
        title: "Viele Klicks, aber das Telefon bleibt still",
        description:
          "Ihr Beitrag wurde 10.000 Mal gesehen. Klingt gut. Aber wie viele davon haben angerufen? Wenn Sie das nicht beantworten können, wissen Sie auch nicht, ob Ihre Werbung Geld bringt — oder nur Geld kostet.",
      },
      {
        title: "Interessenten landen auf Ihrer Startseite und sind weg",
        description:
          `Jemand sieht Ihre Anzeige für Badplanung, klickt drauf — und landet auf der Startseite. Zwischen „Über uns", Stellenangeboten und der Firmengeschichte findet er nicht, was er sucht. Vier Klicks später ist er beim Mitbewerber.`,
      },
      {
        title: "Ihre Anzeige fragt höflich statt klar",
        description:
          `„Mehr erfahren" klickt niemand. Ihr Kunde will wissen: Was passiert, wenn ich hier draufdrücke? Ruf ich an? Krieg ich ein Angebot? Wenn das nicht sofort klar ist, scrollt er weiter — und Sie haben den Klick bezahlt, aber nichts davon.`,
      },
      {
        title: "Wer sich nicht sofort meldet, ist nicht verloren",
        description:
          "Die meisten Leute schauen zwei-, dreimal, bevor sie anfragen. Aber wenn Sie nach dem ersten Klick nichts mehr von sich hören lassen, sind Sie vergessen. Ihr Mitbewerber, der nochmal auftaucht, bekommt den Auftrag.",
      },
      {
        title: "Lokalzeitung, Flyer, Schild am Zaun — und dann?",
        description:
          `Hat alles seine Berechtigung. Aber Ihre Kunden suchen abends auf dem Sofa nach „Küche renovieren [Stadt]" oder sehen auf Instagram, wie ein Betrieb eine Altbausanierung zeigt. Wenn Sie dort nicht auftauchen, existieren Sie für diese Leute nicht.`,
      },
    ],
  },
  branding: {
    headline: "Typische Fehler beim Markenaufbau",
    subline:
      "Bekannt wird nicht wer das schönste Logo hat. Bekannt wird, wer ein Thema besetzt, eine Haltung zeigt und sich nicht in der Marketing-Beliebigkeit verliert. Und das fängt bei den Posts an, nicht bei der Schriftart.",
    mistakes: [
      {
        title: "Niemand weiß, wofür Sie eigentlich stehen",
        description:
          `Logo sitzt, Website steht. Aber wenn jemand fragt: „Was macht die Firma besonders?" — kommt „Qualität und Zuverlässigkeit." Das sagt jeder. Wer nicht in einem Satz erklären kann, warum ausgerechnet er, bleibt austauschbar.`,
      },
      {
        title: "Was Sie auf Facebook posten, posten Sie auch auf Instagram. Und LinkedIn.",
        description:
          "Und es passt nirgends richtig. Auf LinkedIn lesen Entscheider, auf Instagram schauen Leute Bilder, auf TikTok will keiner Ihre Pressemitteilung. Wer überall das Gleiche macht, fällt nirgends auf.",
      },
      {
        title: "Das Video ging viral. Und dann?",
        description:
          "10.000 Views, 200 Likes — aber keine einzige Anfrage. Reichweite fühlt sich gut an, bringt aber nichts, wenn am Ende keiner weiß, was Sie anbieten oder wie er Sie erreicht. Views zahlen keine Rechnungen.",
      },
      {
        title: "Ihre Posts handeln nur von Ihnen",
        description:
          "Neues Projekt, Firmenjubiläum, Auszeichnung gewonnen. Freuen Sie sich — aber Ihre Kunden interessiert das nicht. Der will wissen: Können Sie mein Problem lösen? Wer nur über sich redet, redet an seiner Zielgruppe vorbei.",
      },
      {
        title: "Heute Reels, morgen Karussell, nächste Woche KI-Video",
        description:
          "Jeden Trend mitmachen heißt: nirgends richtig ankommen. Leute folgen Firmen, die für etwas stehen. Nicht Firmen, die alle zwei Wochen was Neues ausprobieren. Beständigkeit schlägt Hype.",
      },
      {
        title: "Ihre Online-Präsenz sieht aus wie jede zweite",
        description:
          `Stockfotos, blaue Farben, „Wir bieten Lösungen aus einer Hand." Klingt professionell — aber auch wie 500 andere Firmen. Wer nicht zeigt, welche Gesichter hinter dem Betrieb stecken und wie es dort wirklich zugeht, bleibt unsichtbar.`,
      },
    ],
  },
  mixed: {
    headline: "Typische Fehler bei Social Media",
    subline:
      "Die meisten Unternehmen posten, aber wenige bauen damit wirklich etwas auf. Hier die häufigsten Stellen wo das schiefgeht.",
    mistakes: [
      {
        title: "Posten ohne Plan",
        description:
          "Mal viel, dann wochenlang nichts. Wenn gerade Zeit ist oder etwas passiert. Der Algorithmus straft genau dieses Muster hart ab.",
      },
      {
        title: "Keine messbaren Ziele",
        description:
          "Was soll Social Media konkret bringen? Wer das nicht definiert, kann auch nicht beurteilen ob es funktioniert.",
      },
      {
        title: "Reichweite mit Wirkung verwechseln",
        description:
          "10 000 Views eines schwachen Posts bringen weniger als 500 Views eines starken, wenn dahinter die richtigen Leute sitzen.",
      },
      {
        title: "Likes als Erfolgsmetrik",
        description:
          "Likes sind nett, zahlen aber keine Rechnung. Die einzige Zahl die zählt: welche Aktion folgt daraus.",
      },
      {
        title: "Alle Plattformen gleichzeitig bespielen",
        description:
          "Lieber eine Plattform richtig als drei halbherzig. Wer überall ein bisschen postet, schafft nirgendwo Wiedererkennung.",
      },
      {
        title: "Content ohne Mensch dahinter",
        description:
          "Anonyme Marken-Posts gehen unter. Sobald Personen zu erkennen sind — Stimme, Gesicht, Haltung — verändert sich die Reichweite spürbar.",
      },
    ],
  },
};
