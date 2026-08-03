/**
 * pdf-slides.tsx
 * Server-side PDF-Generation für 3-Slide-PDF (Mail-1-Anhang).
 *
 * Slide 1: Themen-Verständnis — Pills (Branche · Standort · Schwerpunkt),
 *          Headline, Body, Reichweite-Chart in Card
 * Slide 2: 6 Pain-Cards (3×2-Grid, Nummer oben links, Titel, Body)
 * Slide 3: Case Study — Vorher / Was wir gemacht / Nachher + 3 Metric-Boxen
 *
 * Layout-Vorlage: PrimeSocial · Analyse Template
 * Rendering: @react-pdf/renderer, läuft serverseitig in Vercel-Functions.
 */

import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf,
} from "@react-pdf/renderer";
import type { CaseStudy } from "./pitch-constants";
import { TYPICAL_MISTAKES_BY_LEAD_TYPE } from "./pitch-constants";
import type { PitchLeadType } from "@/types";

// ── Farben (vom Template übernommen) ───────────────────────────────
const BRAND_TEAL = "#0a7a8c";       // Petrol/Türkis — Section-Labels, Pills, Metric-Zahlen
const BRAND_CYAN = "#88dfed";       // Brand-Hell — Akzente / Reels-Balken
const INK = "#0f1115";
const MUTE = "#5b6470";
const MUTE_2 = "#9aa0aa";
const BG_LIGHT = "#f5f6f8";
const BG_NACHHER = "#e8f4f7";       // Leicht cyan-tinted für Nachher-Card
const HEADER_BG = "#0f1115";
const CARD_BORDER = "#e5e7eb";

const PAGE_PAD_X = 40;
const LOGO_PATH = path.join(process.cwd(), "public", "logo", "PrimeSocial.png");

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    color: INK,
  },

  // ─── Schwarzer Header (gleich auf jeder Seite) ───
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: PAGE_PAD_X,
    paddingRight: PAGE_PAD_X,
  },
  headerLogo: { height: 22, width: 110, objectFit: "contain" },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerKunde: {
    fontSize: 10.5,
    color: "#ffffff",
    fontFamily: "Helvetica",
  },
  headerDot: { fontSize: 10, color: "rgba(255,255,255,0.45)" },
  headerVertraulich: {
    fontSize: 9.5,
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
  },
  headerPageNum: {
    fontSize: 10.5,
    color: BRAND_CYAN,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
  },

  // ─── Content-Container ───
  content: {
    paddingTop: 28,
    paddingLeft: PAGE_PAD_X,
    paddingRight: PAGE_PAD_X,
    paddingBottom: 55,
    flexGrow: 1,
  },

  // ─── Section-Label (Subline über Headlines) ───
  sectionLabel: {
    fontSize: 10,
    color: BRAND_TEAL,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    marginBottom: 12,
    fontFamily: "Helvetica-Bold",
  },

  // ─── Slide 1: Pills + Headline + Body + Chart ───
  s1PillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  s1Pill: {
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: "#ffffff",
  },
  s1PillText: {
    fontSize: 9,
    color: BRAND_TEAL,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  s1PillDot: { fontSize: 9, color: MUTE_2 },
  s1Headline: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
    color: INK,
    marginBottom: 22,
    letterSpacing: -0.4,
    maxWidth: "92%",
  },
  s1Split: {
    flexDirection: "row",
    gap: 36,
    alignItems: "flex-start",
  },
  s1BodyCol: { flex: 1, paddingTop: 8 },
  s1ChartCol: { flex: 1.05 },
  s1BodyText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#3b4250",
    maxWidth: "94%",
  },

  // Reichweite-Chart Card
  chartCard: {
    backgroundColor: BG_LIGHT,
    borderRadius: 12,
    padding: 22,
  },
  chartCardLabel: {
    fontSize: 9.5,
    color: BRAND_TEAL,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    lineHeight: 1.5,
    marginBottom: 22,
    maxWidth: "85%",
  },
  chartRow: {
    marginBottom: 16,
  },
  chartRowHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  chartRowLabel: {
    fontSize: 13,
    color: INK,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  chartValueBig: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -1,
  },
  chartBarTrack: {
    height: 10,
    backgroundColor: "#e1e3e8",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6,
  },
  chartBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  chartCaption: {
    fontSize: 9.5,
    color: MUTE,
    lineHeight: 1.45,
    marginTop: 18,
    maxWidth: "95%",
  },

  // ─── Slide 2: 3 Pain-Cards (links) + Chart (rechts) ───
  s2Headline: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.12,
    color: INK,
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  s2Sub: {
    fontSize: 11,
    color: MUTE,
    lineHeight: 1.5,
    marginBottom: 20,
    maxWidth: "82%",
  },
  s2Split: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
  },
  s2CardsCol: { flex: 1 },
  s2ChartCol: { flex: 1.05 },
  s2Card: {
    backgroundColor: BG_LIGHT,
    borderRadius: 10,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 10,
  },
  s2CardNum: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND_TEAL,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  s2CardTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: INK,
    lineHeight: 1.3,
    marginBottom: 6,
  },
  s2CardDesc: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: "#4a5260",
  },

  // Problem-Visualisierung (Slide 2) — Isotype/Dot-Grid statt Bars
  problemChartCard: {
    backgroundColor: BG_LIGHT,
    borderRadius: 12,
    padding: 22,
  },
  problemChartLabel: {
    fontSize: 9.5,
    color: BRAND_TEAL,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    lineHeight: 1.5,
    marginBottom: 6,
    maxWidth: "92%",
  },
  problemChartLead: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: INK,
    letterSpacing: -0.4,
    lineHeight: 1.15,
    marginBottom: 18,
    maxWidth: "92%",
  },
  problemChartLeadAccent: {
    color: BRAND_TEAL,
  },
  dotGridWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginBottom: 4,
  },
  dotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 140,
  },
  dot: {
    width: 12,
    height: 12,
    marginRight: 2,
    marginBottom: 2,
    borderRadius: 2.5,
  },
  legend: {
    flex: 1,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 10,
  },
  legendPct: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: INK,
    width: 36,
  },
  legendLabel: {
    fontSize: 10,
    color: "#3b4250",
    flex: 1,
    lineHeight: 1.35,
  },
  problemBarCaption: {
    fontSize: 9,
    color: MUTE,
    lineHeight: 1.45,
    marginTop: 12,
  },

  // ─── Slide 3: Case Study ───
  s3Headline: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.1,
    color: INK,
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  s3Meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },
  s3MetaText: {
    fontSize: 9.5,
    color: MUTE,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  vunRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  vunBox: {
    flex: 1,
    paddingTop: 13,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: 10,
  },
  vunBoxVorher: { backgroundColor: BG_LIGHT },
  vunBoxUmsetzung: { backgroundColor: BG_LIGHT },
  vunBoxNachher: { backgroundColor: BG_NACHHER },
  vunLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  vunLabelDash: {
    width: 14,
    height: 1.5,
    backgroundColor: BRAND_TEAL,
  },
  vunLabel: {
    fontSize: 9,
    color: BRAND_TEAL,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  vunText: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: INK,
  },

  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 16,
    backgroundColor: BG_LIGHT,
    borderRadius: 10,
  },
  metricValue: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: BRAND_TEAL,
    letterSpacing: -1,
    lineHeight: 1,
  },
  metricLabel: {
    fontSize: 9,
    color: MUTE,
    lineHeight: 1.35,
    flex: 1,
  },

  // ─── Footer (auf jeder Seite gleich) ───
  footer: {
    position: "absolute",
    bottom: 22,
    left: PAGE_PAD_X,
    right: PAGE_PAD_X,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#eef0f2",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    fontSize: 9,
    color: MUTE,
  },
  footerText: { fontSize: 9, color: MUTE },
  footerDot: { fontSize: 8.5, color: MUTE_2 },
  footerRight: { fontSize: 9, color: MUTE },
});

interface SlideContent {
  headline: string;
  subline: string;            // wird in Pills aufgesplittet (Branche · Standort · Schwerpunkt)
  body_text: string;
  key_statement?: string;     // wird im neuen Layout nicht mehr gerendert
  /** @deprecated */
  our_approach?: string;
}

interface CompanyMeta {
  companyName: string;
}

function resolveAssetPath(rel: string | undefined): string | null {
  if (!rel) return null;
  const clean = rel.startsWith("/") ? rel.slice(1) : rel;
  return path.join(process.cwd(), "public", clean);
}

// ─────────────────────────────────────────────
// Header & Footer
// ─────────────────────────────────────────────
function PageHeader({ pageNum, total, companyName }: { pageNum: number; total: number; companyName: string }) {
  const pn = `${String(pageNum).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  return (
    <View style={styles.header}>
      <Image src={LOGO_PATH} style={styles.headerLogo} />
      <View style={styles.headerRight}>
        <Text style={styles.headerKunde}>Für {companyName}</Text>
        <Text style={styles.headerDot}>·</Text>
        <Text style={styles.headerVertraulich}>VERTRAULICH</Text>
        <Text style={styles.headerDot}>·</Text>
        <Text style={styles.headerPageNum}>{pn}</Text>
      </View>
    </View>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerLeft}>
        <Text style={styles.footerText}>niklas@primesocial.de</Text>
        <Text style={styles.footerDot}>·</Text>
        <Text style={styles.footerText}>0162 4035041</Text>
      </View>
      <Text style={styles.footerRight}>primesocial.de</Text>
    </View>
  );
}

// ─────────────────────────────────────────────
// Slide 1 — Themen-Verständnis
// Splittet `content.subline` an "·" auf bis zu 3 Pills.
// ─────────────────────────────────────────────
function Pills({ value }: { value: string }) {
  const parts = value
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return (
    <View style={styles.s1PillsRow}>
      {parts.map((p, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={styles.s1Pill}>
            <Text style={styles.s1PillText}>{p}</Text>
          </View>
          {i < parts.length - 1 ? <Text style={styles.s1PillDot}>·</Text> : null}
        </View>
      ))}
    </View>
  );
}

function ReichweiteChart() {
  // Werte sind hardcoded weil die Aussage statisch ist (Instagram-Algorithmus 2026).
  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartCardLabel}>So viel Reichweite kommt bei neuen Leuten an</Text>

      <View style={styles.chartRow}>
        <View style={styles.chartRowHead}>
          <Text style={styles.chartRowLabel}>Reels / Video</Text>
          <Text style={[styles.chartValueBig, { color: BRAND_TEAL }]}>80 %</Text>
        </View>
        <View style={styles.chartBarTrack}>
          <View style={[styles.chartBarFill, { width: "80%", backgroundColor: BRAND_TEAL }]} />
        </View>
      </View>

      <View style={styles.chartRow}>
        <View style={styles.chartRowHead}>
          <Text style={styles.chartRowLabel}>Bilder</Text>
          <Text style={[styles.chartValueBig, { color: MUTE_2 }]}>10 %</Text>
        </View>
        <View style={styles.chartBarTrack}>
          <View style={[styles.chartBarFill, { width: "10%", backgroundColor: MUTE_2 }]} />
        </View>
      </View>

      <Text style={styles.chartCaption}>
        Quelle: Instagram-Algorithmus 2026 — Reichweite an Nicht-Follower nach Format
      </Text>
    </View>
  );
}

// ConversionLeverChart — Sales-Trigger fuer Leadgen-PDFs.
// Aussage: Organischer Content baut Vertrauen + Audience-Daten auf,
// Meta Ads konvertieren diese warme Zielgruppe in Kunden bei einem
// Bruchteil der Kosten. Loop: Ads befeuern gleichzeitig die organische
// Reichweite, weil sie Engagement zurueck ins Profil spielen.
function ConversionLeverChart() {
  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartCardLabel}>Was Meta Ads auf solidem Content leisten</Text>

      <View style={styles.chartRow}>
        <View style={styles.chartRowHead}>
          <Text style={styles.chartRowLabel}>Warmes Targeting (eure Audience)</Text>
          <Text style={[styles.chartValueBig, { color: BRAND_TEAL }]}>6,5 %</Text>
        </View>
        <View style={styles.chartBarTrack}>
          <View style={[styles.chartBarFill, { width: "65%", backgroundColor: BRAND_TEAL }]} />
        </View>
      </View>

      <View style={styles.chartRow}>
        <View style={styles.chartRowHead}>
          <Text style={styles.chartRowLabel}>Kaltes Targeting (Algorithmus rät)</Text>
          <Text style={[styles.chartValueBig, { color: MUTE_2 }]}>0,8 %</Text>
        </View>
        <View style={styles.chartBarTrack}>
          <View style={[styles.chartBarFill, { width: "8%", backgroundColor: MUTE_2 }]} />
        </View>
      </View>

      <Text style={styles.chartCaption}>
        Conversion-Rate je nach Audience-Temperatur. Wer organisch sichtbar ist,
        hat eine warme Zielgruppe — Ads drehen diese zu Kunden, gleichzeitig
        wächst die organische Reichweite mit.
      </Text>
    </View>
  );
}

function Slide1({ content, companyName, leadType }: { content: SlideContent; companyName: string; leadType: PitchLeadType }) {
  // Leadgen-PDFs zeigen die Conversion-Hebel-Logik, alle anderen die
  // Reichweite-nach-Format-Logik (Reels vs. Bilder).
  const Chart = leadType === "leadgen" ? ConversionLeverChart : ReichweiteChart;
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageHeader pageNum={1} total={3} companyName={companyName} />
      <View style={styles.content}>
        <Pills value={content.subline} />
        <Text style={styles.s1Headline}>{content.headline}</Text>
        <View style={styles.s1Split}>
          <View style={styles.s1BodyCol}>
            <Text style={styles.s1BodyText}>{content.body_text}</Text>
          </View>
          <View style={styles.s1ChartCol}>
            <Chart />
          </View>
        </View>
      </View>
      <Footer />
    </Page>
  );
}

// ─────────────────────────────────────────────
// Slide 2 — 3 Pain-Cards (links) + Problem-Visualisierung (rechts)
// ─────────────────────────────────────────────
interface ProblemChartBar {
  label: string;
  pct: number;
  highlight?: boolean;
}
interface ProblemChartData {
  title: string;
  bars: ProblemChartBar[];
  caption: string;
}

// Pro Lead-Typ: eine kleine Grafik, die das Kernproblem visualisiert
// (Wo die Zielgruppe heute wirklich ihre Aufmerksamkeit hinlegt).
const PROBLEM_CHARTS: Record<PitchLeadType, ProblemChartData> = {
  recruiting: {
    title: "Wo gute Leute heute nach Jobs scrollen",
    bars: [
      { label: "Instagram & TikTok", pct: 85, highlight: true },
      { label: "Stepstone & Indeed", pct: 12 },
      { label: "Klassische Stellenanzeige", pct: 3 },
    ],
    caption: "Indikativ · Branchenschnitt 2026 — wo Bewerber im Alltag Zeit verbringen",
  },
  leadgen: {
    title: "Wie Entscheider neue Anbieter heute finden",
    bars: [
      { label: "Empfehlung & Social Media", pct: 67, highlight: true },
      { label: "Google-Suche", pct: 28 },
      { label: "Anzeigen & Cold Outreach", pct: 5 },
    ],
    caption: "Indikativ · B2B-Buyer-Trend 2026 — Erstkontakt zu neuen Anbietern",
  },
  branding: {
    title: "Wo Marken-Aufmerksamkeit heute entsteht",
    bars: [
      { label: "Social Media organisch", pct: 78, highlight: true },
      { label: "Suchmaschinen & Empfehlung", pct: 16 },
      { label: "Klassische Werbung", pct: 6 },
    ],
    caption: "Indikativ · Brand-Trend 2026 — Erstkontakt mit unbekannten Marken",
  },
  mixed: {
    title: "Wo eure Zielgruppe heute aufmerksam ist",
    bars: [
      { label: "Social Media", pct: 80, highlight: true },
      { label: "Suchmaschinen", pct: 15 },
      { label: "Klassische Touchpoints", pct: 5 },
    ],
    caption: "Indikativ · Branchenschnitt 2026 — tägliche Aufmerksamkeit nach Kanal",
  },
};

// Isotype-Grid: 100 Punkte, eingefärbt nach data.bars[].pct.
// Kommuniziert die Aussage „X von 100" direkt visuell — anders als die
// horizontalen Balken auf Slide 1.
function ProblemChart({ data }: { data: ProblemChartData }) {
  const palette = data.bars.map((b, i) => {
    if (b.highlight) return BRAND_TEAL;
    if (i === 1) return "#9aa0aa";
    return "#cbd0d8";
  });

  const dots: string[] = [];
  data.bars.forEach((bar, i) => {
    for (let n = 0; n < bar.pct; n++) dots.push(palette[i]);
  });
  while (dots.length < 100) dots.push("#e1e3e8");

  return (
    <View style={styles.problemChartCard}>
      <Text style={styles.problemChartLabel}>{data.title}</Text>
      <View style={styles.dotGridWrap}>
        <View style={styles.dotGrid}>
          {dots.slice(0, 100).map((color, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: color }]} />
          ))}
        </View>
        <View style={styles.legend}>
          {data.bars.map((b, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: palette[i] }]} />
              <Text style={styles.legendPct}>{b.pct} %</Text>
              <Text style={styles.legendLabel}>{b.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.problemBarCaption}>{data.caption}</Text>
    </View>
  );
}

function Slide2({
  leadType,
  companyName,
  customPains,
}: {
  leadType: PitchLeadType;
  companyName: string;
  customPains?: { title: string; description: string }[];
}) {
  // Fallback: branding (organisch) ist der universelle All-Arounder
  // — passt zu jedem Lead, egal welche Branche.
  const block =
    TYPICAL_MISTAKES_BY_LEAD_TYPE[leadType] ??
    TYPICAL_MISTAKES_BY_LEAD_TYPE.branding;
  const chart = PROBLEM_CHARTS[leadType] ?? PROBLEM_CHARTS.branding;

  // Individuelle Pain-Cards von Claude bevorzugen. Fallback: generische
  // TYPICAL_MISTAKES_BY_LEAD_TYPE (für ältere Drafts oder Claude-Fehler).
  const pains =
    customPains && customPains.length >= 2
      ? customPains.slice(0, 2)
      : block.mistakes.slice(0, 2);

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageHeader pageNum={2} total={3} companyName={companyName} />
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Das Problem</Text>
        <Text style={styles.s2Headline}>{block.headline}</Text>
        <Text style={styles.s2Sub}>{block.subline}</Text>
        <View style={styles.s2Split}>
          <View style={styles.s2CardsCol}>
            {pains.map((m, i) => (
              <View key={i} style={styles.s2Card}>
                <Text style={styles.s2CardNum}>{String(i + 1).padStart(2, "0")} · Fehler</Text>
                <Text style={styles.s2CardTitle}>{m.title}</Text>
                <Text style={styles.s2CardDesc}>{m.description}</Text>
              </View>
            ))}
          </View>
          <View style={styles.s2ChartCol}>
            <ProblemChart data={chart} />
          </View>
        </View>
      </View>
      <Footer />
    </Page>
  );
}

// ─────────────────────────────────────────────
// Slide 3 — Case Study (Vorher / Was wir machten / Nachher + 3 Metric-Boxen)
// ─────────────────────────────────────────────
function Slide3({ caseStudy, companyName }: { caseStudy: CaseStudy; companyName: string }) {
  const hasVorherNachher = !!(caseStudy.vorher && caseStudy.umsetzung && caseStudy.nachher);

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <PageHeader pageNum={3} total={3} companyName={companyName} />
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Unser Fallbeispiel</Text>
        <Text style={styles.s3Headline}>{caseStudy.firmenname}</Text>
        <View style={styles.s3Meta}>
          <Text style={styles.s3MetaText}>{caseStudy.branche}</Text>
          <Text style={[styles.headerDot, { color: MUTE_2 }]}>·</Text>
          <Text style={styles.s3MetaText}>{caseStudy.typ.replace(/→/g, "›")}</Text>
        </View>

        {hasVorherNachher ? (
          <View style={styles.vunRow}>
            <View style={[styles.vunBox, styles.vunBoxVorher]}>
              <View style={styles.vunLabelRow}>
                <View style={styles.vunLabelDash} />
                <Text style={styles.vunLabel}>Vorher</Text>
              </View>
              <Text style={styles.vunText}>{caseStudy.vorher}</Text>
            </View>
            <View style={[styles.vunBox, styles.vunBoxUmsetzung]}>
              <View style={styles.vunLabelRow}>
                <View style={styles.vunLabelDash} />
                <Text style={styles.vunLabel}>Was wir gemacht haben</Text>
              </View>
              <Text style={styles.vunText}>{caseStudy.umsetzung}</Text>
            </View>
            <View style={[styles.vunBox, styles.vunBoxNachher]}>
              <View style={styles.vunLabelRow}>
                <View style={styles.vunLabelDash} />
                <Text style={styles.vunLabel}>Nachher</Text>
              </View>
              <Text style={styles.vunText}>{caseStudy.nachher}</Text>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 11, lineHeight: 1.55, color: INK, marginBottom: 16 }}>
            {caseStudy.kurzbeschreibung}
          </Text>
        )}

        <View style={styles.metricsRow}>
          {caseStudy.metrics.slice(0, 3).map((m, i) => (
            <View key={i} style={styles.metricBox}>
              <Text style={styles.metricValue}>{m.value.replace(/→/g, "›")}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Footer />
    </Page>
  );
}

export interface SlidesPdfInput {
  content: SlideContent;
  caseStudy: CaseStudy;
  meta: CompanyMeta;
  leadType?: PitchLeadType | null;
  // Lead-spezifische Pain-Cards für Slide 2 (von Claude generiert).
  // Wenn null/leer: Fallback auf TYPICAL_MISTAKES_BY_LEAD_TYPE.
  customPains?: { title: string; description: string }[];
}

export async function renderSlidesPdf(input: SlidesPdfInput): Promise<Buffer> {
  // Fallback: branding (organisch) — universeller All-Arounder, der zu jedem Lead passt.
  const leadType: PitchLeadType = input.leadType ?? "branding";
  const doc = (
    <Document>
      <Slide1 content={input.content} companyName={input.meta.companyName} leadType={leadType} />
      <Slide2 leadType={leadType} companyName={input.meta.companyName} customPains={input.customPains} />
      <Slide3 caseStudy={input.caseStudy} companyName={input.meta.companyName} />
    </Document>
  );
  const stream = (await pdf(doc).toBuffer()) as unknown as NodeJS.ReadableStream;
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// resolveAssetPath wird aktuell nicht mehr genutzt (Hero-Bild raus), bleibt
// fuer kommende Erweiterungen.
void resolveAssetPath;
