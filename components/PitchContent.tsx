import type { PitchPage, PitchVorgehenBlock, Platform, GoogleReview, PitchLeadType } from "@/types";
import {
  type CaseStudy,
  CONTACT,
  CALENDLY_URL,
  FOCUS_AREAS,
  buildReferencesUrl,
  BRAND_COLOR,
  BRAND_GRADIENT,
  BRAND_GRADIENT_TEXT,
  BRAND_GRADIENT_START,
  TYPICAL_MISTAKES_BY_LEAD_TYPE,
  PLATFORM_PROFILES,
  type ComparePlatformKey,
  VORGEHEN_BLOCKS,
  platformGoodForByLeadType,
} from "@/lib/pitch-constants";
import { GoogleReviewsSection } from "@/components/GoogleReviewsSection";

interface PitchContentProps {
  pitch: PitchPage;
  caseStudies: CaseStudy[];
  googleReviews?: GoogleReview[];
  // Vorname des Lead-Ansprechpartners — wird im Header "Vorbereitet für [Vorname]"
  // angezeigt, darunter der Firmenname. Optional: wenn null nur Firmenname.
  contactFirstName?: string | null;
}

const ACCENT = BRAND_COLOR;
const TEXT_PRIMARY = "#0f1117";
const TEXT_SECONDARY = "#6b7280";
const BG_LIGHT = "#f7f8fa";

// ─────────────────────────────────────────────
// SVG-Icons (inline, keine externe Lib)
// Alle Icons: 24×24 viewBox, strokeWidth 1.8, currentColor
// ─────────────────────────────────────────────
function IconBase({ children, className = "w-6 h-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function IconContent(props: { className?: string }) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="M10 13l4 2-4 2v-4z" fill="currentColor" />
    </IconBase>
  );
}

function IconAds(props: { className?: string }) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </IconBase>
  );
}

function IconCareer(props: { className?: string }) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
      <path d="M3 12h18" />
    </IconBase>
  );
}

function IconPlan(props: { className?: string }) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h2M12 14h4M8 18h6" />
    </IconBase>
  );
}

function IconProduce(props: { className?: string }) {
  return (
    <IconBase {...props}>
      <path d="M3 4h12l4 4v12a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2z" transform="translate(2 0)" />
      <path d="M14 4v6h6" transform="translate(2 0)" />
      <circle cx="11" cy="15" r="3" />
    </IconBase>
  );
}

function IconPublish(props: { className?: string }) {
  return (
    <IconBase {...props}>
      <path d="M3 12l9-9 9 9" />
      <path d="M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" />
      <path d="M12 21V12" />
    </IconBase>
  );
}

function IconFacebook({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.6 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

function IconInstagram({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function IconTikTok({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.31a8.16 8.16 0 0 0 4.77 1.52V6.38a4.83 4.83 0 0 1-1.84-.31z" />
    </svg>
  );
}

function IconLinkedIn({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM8.5 18H6V10h2.5v8zM7.25 8.5A1.5 1.5 0 117.25 5.5a1.5 1.5 0 010 3zM18 18h-2.5v-4.25c0-1.05-.02-2.4-1.5-2.4-1.5 0-1.75 1.15-1.75 2.32V18H9.75V10h2.4v1.1h.03c.34-.6 1.16-1.25 2.39-1.25 2.55 0 3.03 1.68 3.03 3.87V18z" />
    </svg>
  );
}

function vorgehenIconFor(index: number): (p: { className?: string }) => React.ReactElement {
  if (index === 0) return IconPlan;
  if (index === 1) return IconProduce;
  return IconPublish;
}

function focusIconFor(focus: "recruiting" | "meta_ads" | "organic"): (p: { className?: string }) => React.ReactElement {
  if (focus === "recruiting") return IconCareer;
  if (focus === "meta_ads")   return IconAds;
  return IconContent;
}

export function PitchContent({ pitch, caseStudies, googleReviews = [], contactFirstName }: PitchContentProps) {
  const companyName = pitch.company_name_display ?? "Eure Firma";

  return (
    <div
      className="min-h-screen"
      style={{ background: "#ffffff", color: TEXT_PRIMARY, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Sektion 1: Logo-Leiste (dunkler Header, echtes Logo, Kunde als gestackter Subtitle) */}
      <header
        data-pitch-section="logo_bar"
        className="sticky top-0 z-30 border-b"
        style={{ background: "#0f1115", borderColor: "#1f2937" }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-5 sm:px-8 py-4">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/PrimeSocial.png"
              alt="PrimeSocial"
              className="h-7 sm:h-8 w-auto select-none"
              draggable={false}
            />
            <div className="h-7 sm:h-8 w-px" style={{ background: "rgba(255,255,255,0.15)" }} aria-hidden="true" />
            <div className="flex flex-col leading-tight">
              <span
                className="text-[10px] sm:text-[11px] font-medium uppercase"
                style={{ color: "rgba(255,255,255,0.55)", letterSpacing: "0.18em" }}
              >
                Vorbereitet für
              </span>
              {contactFirstName ? (
                <>
                  <span className="text-sm sm:text-base font-semibold" style={{ color: "#ffffff" }}>
                    {contactFirstName}
                  </span>
                  <span className="text-[11px] sm:text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
                    {companyName}
                  </span>
                </>
              ) : (
                <span className="text-sm sm:text-base font-semibold" style={{ color: "#ffffff" }}>
                  {companyName}
                </span>
              )}
            </div>
          </div>
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-pitch-cta="header_termin"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shrink-0"
            style={{ background: BRAND_GRADIENT, color: BRAND_GRADIENT_TEXT }}
          >
            Kalendertermin buchen
          </a>
        </div>
      </header>

      {/* Sektion 2: Hero — schwarzer Hintergrund, weiße Schrift, Cyan-Akzente */}
      <section
        data-pitch-section="hero"
        className="relative overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 80% 30%, ${ACCENT}22, transparent 60%), #0f1115`,
        }}
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute -right-20 -top-32 w-[600px] h-[600px] rounded-full opacity-50"
            style={{
              background: `radial-gradient(circle, ${ACCENT}30 0%, transparent 70%)`,
              filter: "blur(80px)",
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-12 sm:pb-24 lg:pt-28 lg:pb-36">
          <div className="grid gap-10 lg:gap-16 lg:grid-cols-[1.15fr_1fr] items-center">
            <div className="max-w-3xl">
              {pitch.hero_meta ? (
                <p className="mb-4 sm:mb-5 text-[11px] sm:text-xs uppercase tracking-[0.18em] font-bold" style={{ color: ACCENT }}>
                  {pitch.hero_meta}
                </p>
              ) : null}
              <h1
                className="font-bold leading-[1.08] tracking-tight"
                style={{
                  color: "#ffffff",
                  fontSize: "clamp(30px, 5.5vw, 64px)",
                  letterSpacing: "-0.02em",
                }}
              >
                {pitch.hero_headline}{" "}
                {pitch.hero_subline_accent ? (
                  <span style={{ color: ACCENT }}>{pitch.hero_subline_accent}</span>
                ) : null}
              </h1>
              {pitch.hero_text ? (
                <p
                  className="mt-5 sm:mt-6 text-[15px] sm:text-lg lg:text-xl leading-relaxed max-w-xl"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {pitch.hero_text}
                </p>
              ) : null}
              <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-pitch-cta="hero_termin"
                  className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3.5 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5"
                  style={{
                    background: BRAND_GRADIENT,
                    color: BRAND_GRADIENT_TEXT,
                    boxShadow: `0 8px 24px ${BRAND_GRADIENT_START}60`,
                  }}
                >
                  Kalendertermin buchen
                </a>
                <a
                  href="#referenzen"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-colors hover:bg-white/5"
                  style={{ background: "transparent", color: "#ffffff", border: "1px solid rgba(255,255,255,0.25)" }}
                >
                  Fallbeispiele ansehen ↓
                </a>
              </div>
            </div>

            {/* Phone-Mockup mit Hero-Video — nur ab lg sichtbar */}
            <div className="hidden lg:flex justify-center lg:justify-end">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Sektion 3: Typische Fehler (Pain-Awareness vor Lösung) */}
      <TypicalMistakesSection leadType={pitch.lead_type ?? null} />

      {/* Sektion 4: Plattform-Vergleich (Edukation, keine Lösungs-Pitch) */}
      <PlatformComparisonSection
        activePlatforms={(pitch.platforms ?? []) as Platform[]}
        leadType={pitch.lead_type ?? null}
      />

      {/* Sektion 6: Case Studies */}
      <section id="referenzen" data-pitch-section="case_studies" className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20 lg:py-28">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">Was wir für andere Unternehmen erreicht haben</h2>
        <p className="text-lg mb-12 max-w-2xl" style={{ color: TEXT_SECONDARY }}>
          Andere Branche, gleiches Problem. Und was wir dort konkret verändert haben.
        </p>

        <div className="hidden md:grid gap-6 lg:grid-cols-3">
          {caseStudies.map((cs) => (
            <CaseStudyCard key={cs.key} caseStudy={cs} imageOverflow={pitch.focus_area === "organic"} />
          ))}
          <WeitereReferenzenCard slug={pitch.slug} />
        </div>

        <div className="md:hidden -mx-5">
          <div
            className="flex gap-4 overflow-x-auto px-5 pb-4 snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
          >
            {caseStudies.map((cs) => (
              <div key={cs.key} className="snap-start shrink-0 w-[88%]">
                <CaseStudyCard caseStudy={cs} imageOverflow={pitch.focus_area === "organic"} />
              </div>
            ))}
            <div className="snap-start shrink-0 w-[88%]">
              <WeitereReferenzenCard slug={pitch.slug} />
            </div>
          </div>
        </div>
      </section>

      {/* Mid-CTA — direkt nach Referenzen, vor Google-Reviews */}
      <MidCTASection />

      {/* Sektion 6c: Google-Reviews */}
      {googleReviews.length > 0 ? <GoogleReviewsSection reviews={googleReviews} /> : null}

      {/* Sektion 6d: Landing-Page-Meme (Wiedererkennung / Augenzwinkern) */}
      <section
        data-pitch-section="landing_meme"
        className="py-12 sm:py-16"
        style={{ background: "#ffffff" }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/memes/LandingPage.png"
            alt=""
            aria-hidden="true"
            className="w-full h-auto rounded-xl select-none"
            style={{ maxWidth: "560px" }}
            draggable={false}
          />
        </div>
      </section>

      {/* Sektion 6b: Was wir außerdem anbieten */}
      {pitch.focus_area ? (
        <section
          data-pitch-section="other_focus"
          className="py-14 sm:py-20 lg:py-28"
          style={{ background: BG_LIGHT }}
        >
          <div className="max-w-6xl mx-auto px-5 sm:px-8">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">Was wir außerdem anbieten</h2>
            <p className="text-lg mb-14 max-w-2xl" style={{ color: TEXT_SECONDARY }}>
              Nicht jeder Engpass ist gleich. Diese Bereiche begleiten wir parallel, wenn sie relevant werden.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              {FOCUS_AREAS.filter((f) => f.key !== pitch.focus_area).map((f) => {
                const Icon = focusIconFor(f.key);
                return (
                  <article
                    key={f.key}
                    className="group rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110"
                        style={{
                          background: `${ACCENT}1F`,
                          color: "#0a7a8c",
                        }}
                        aria-hidden="true"
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>
                        {f.title}
                      </h3>
                    </div>
                    <p className="text-sm sm:text-[15px] leading-relaxed mb-5" style={{ color: TEXT_SECONDARY }}>
                      {f.description}
                    </p>
                    <ul className="space-y-2.5">
                      {f.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: TEXT_PRIMARY }}>
                          <svg
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-4 h-4 shrink-0 mt-0.5"
                            style={{ color: ACCENT }}
                            aria-hidden="true"
                          >
                            <path d="M4 10.5l4 4 8-9" />
                          </svg>
                          <span className="leading-snug">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Sektion 7: Vorgehen */}
      <section
        data-pitch-section="vorgehen"
        className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-20 lg:py-28"
      >
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">Überblick und Vorgehen</h2>
        <p className="text-lg mb-14 max-w-2xl" style={{ color: TEXT_SECONDARY }}>
          Von Tag 1 bis zum ersten Post. Transparent, planbar und mit klaren Verantwortlichkeiten.
        </p>
        <div className="grid gap-6 lg:grid-cols-3">
          {VORGEHEN_BLOCKS.map((block, i) => (
            <VorgehenCard key={i} block={block} index={i} />
          ))}
        </div>
      </section>

      {/* Final-CTA — letzter Aufruf vor Footer, Lead-Type-spezifische Headline */}
      <FinalCTASection leadType={pitch.lead_type ?? null} />

      {/* Footer (schwarzer Hintergrund, echtes Logo) */}
      <footer style={{ background: "#0f1115" }}>
        <div
          className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col items-center text-center gap-4 sm:flex-row sm:items-center sm:justify-between sm:text-left text-sm"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/PrimeSocial.png"
              alt="PrimeSocial"
              className="h-6 w-auto select-none"
              draggable={false}
            />
            <span>© {new Date().getFullYear()}</span>
          </div>
          <nav className="flex gap-5">
            <a href="https://www.primesocial.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Impressum</a>
            <a href="https://www.primesocial.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Datenschutz</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sektion 3: Typische Fehler (Pain-Awareness)
// Nummerierte Pain-Cards in 2×3-Grid, gleicher Stil wie der Rest der Seite.
// ─────────────────────────────────────────────
function TypicalMistakesSection({ leadType }: { leadType: PitchLeadType | null }) {
  const block = TYPICAL_MISTAKES_BY_LEAD_TYPE[leadType ?? "mixed"] ?? TYPICAL_MISTAKES_BY_LEAD_TYPE.mixed;

  return (
    <section
      id="konzept"
      data-pitch-section="typical_mistakes"
      className="py-14 sm:py-20 lg:py-28"
      style={{ background: "#ffffff" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <p className="mb-3 text-[11px] sm:text-xs uppercase font-bold" style={{ color: ACCENT, letterSpacing: "0.18em" }}>
          Was viele übersehen
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">{block.headline}</h2>
        <p className="text-lg mb-12 sm:mb-14 max-w-2xl" style={{ color: TEXT_SECONDARY }}>
          {block.subline}
        </p>
        <div className="grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {block.mistakes.map((m, i) => (
            <article
              key={i}
              className="rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md flex flex-col"
              style={{
                background: BG_LIGHT,
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="pitch-number-pulse inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
                  style={{
                    background: `${ACCENT}22`,
                    color: TEXT_PRIMARY,
                    animationDelay: `${i * 0.4}s`,
                  }}
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-semibold text-base sm:text-lg leading-snug" style={{ color: TEXT_PRIMARY }}>
                  {m.title}
                </h3>
              </div>
              <p className="text-sm sm:text-[15px] leading-relaxed" style={{ color: TEXT_SECONDARY }}>
                {m.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// Sektion 4: Plattform-Vergleich (Pain-Awareness statt Lösungs-Pitch)
// Zeigt alle 4 Plattformen mit Zielgruppe, Stärken, Schwächen. Die in
// pitch.platforms aktiven werden mit Brand-Glow visuell hervorgehoben,
// die anderen bleiben dezent.
// ─────────────────────────────────────────────
function PlatformIconBox({ platform }: { platform: ComparePlatformKey }) {
  if (platform === "linkedin") return <IconLinkedIn className="w-6 h-6" />;
  if (platform === "facebook") return <IconFacebook className="w-6 h-6" />;
  if (platform === "instagram") return <IconInstagram className="w-6 h-6" />;
  return <IconTikTok className="w-6 h-6" />;
}

function PlatformComparisonSection({
  activePlatforms,
  leadType,
}: {
  activePlatforms: Platform[];
  leadType: PitchLeadType | null;
}) {
  const activeSet = new Set<ComparePlatformKey>(activePlatforms as ComparePlatformKey[]);

  const active = PLATFORM_PROFILES.filter((p) => activeSet.has(p.key));
  const inactive = PLATFORM_PROFILES.filter((p) => !activeSet.has(p.key));

  // Desktop: Pyramide — Aktive in der Mitte, Inaktive außen.
  // Beispiel: 2 aktive (FB+IG) + 2 inaktive (LinkedIn+TikTok) →
  // [LinkedIn, Facebook, Instagram, TikTok]
  const sortedDesktop = (() => {
    const halfLeft = Math.floor(inactive.length / 2);
    return [...inactive.slice(0, halfLeft), ...active, ...inactive.slice(halfLeft)];
  })();
  // Mobile: Active first — relevante Plattform direkt sichtbar beim Aufruf.
  // Beispiel: [Facebook, Instagram, LinkedIn, TikTok]
  const sortedMobile = [...active, ...inactive];

  // Subline je Lead-Type — Headline ist fuer alle gleich.
  const sublineByType: Record<PitchLeadType | "default", string> = {
    recruiting:
      "Nicht jede Plattform erreicht Ihre Wunsch-Bewerber. Die für Sie relevanten sind größer dargestellt. Die anderen stehen zum Vergleich.",
    leadgen:
      "Nicht überall sind Ihre potenziellen Kunden zu Hause. Die für Sie relevanten Plattformen sind größer dargestellt. Die anderen stehen zum Vergleich.",
    branding:
      "Bekannt wird man dort, wo die richtige Zielgruppe schon ist. Die für Sie relevanten Plattformen sind größer dargestellt. Die anderen stehen zum Vergleich.",
    mixed:
      "Jede Plattform spielt andere Stärken aus. Die für Sie relevanten sind größer dargestellt. Die anderen stehen zum Vergleich.",
    default:
      "Die für Sie relevanten Plattformen sind größer dargestellt. Die anderen stehen zum Vergleich.",
  };
  const text = {
    h: "Welche Plattformen für Sie relevant sind",
    sub: sublineByType[leadType ?? "default"] ?? sublineByType.default,
  };

  return (
    <section data-pitch-section="platform_comparison" className="py-14 sm:py-20 lg:py-28">
      {/* Headline-Container behält max-width, Slider bricht edge-to-edge aus */}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 mb-10 sm:mb-14">
        <p className="mb-3 text-[11px] sm:text-xs uppercase font-bold" style={{ color: ACCENT, letterSpacing: "0.18em" }}>
          Plattform-Relevanz
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
          {text.h}
        </h2>
        <p className="text-lg max-w-2xl" style={{ color: TEXT_SECONDARY }}>
          {text.sub}
        </p>
      </div>

      {/* Slider — auf Mobile mit Active-First-Sortierung, auf Desktop Pyramide */}
      <div className="md:hidden">{renderPlatformSlider(sortedMobile, activeSet, leadType)}</div>
      <div className="hidden md:block">{renderPlatformSlider(sortedDesktop, activeSet, leadType)}</div>
    </section>
  );
}

// Slider-Body extrahiert damit wir ihn mit zwei verschiedenen Sortierungen
// rendern können (Mobile vs Desktop) ohne 100 Zeilen JSX zu duplizieren.
function renderPlatformSlider(
  list: typeof PLATFORM_PROFILES,
  activeSet: Set<ComparePlatformKey>,
  leadType: PitchLeadType | null,
) {
  return (
    <div
      className="overflow-x-auto snap-x snap-mandatory pt-5 pb-6"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(0,0,0,0.15) transparent",
        WebkitOverflowScrolling: "touch" as never,
      }}
    >
      <div className="flex gap-4 sm:gap-5 px-5 sm:px-8 items-stretch">
        {list.map((p) => {
          const active = activeSet.has(p.key);
          return (
            <article
              key={p.key}
              className="snap-start shrink-0 rounded-2xl transition-all duration-300 relative flex flex-col"
              style={
                active
                  ? {
                      width: "min(85vw, 400px)",
                      padding: "1.75rem",
                      background: BG_LIGHT,
                      border: `2px solid ${ACCENT}`,
                      boxShadow: `0 0 0 4px ${ACCENT}22, 0 12px 32px ${BRAND_GRADIENT_START}25`,
                    }
                  : {
                      width: "min(68vw, 300px)",
                      padding: "1.25rem",
                      background: BG_LIGHT,
                      border: "1px solid #e5e7eb",
                      opacity: 0.75,
                    }
              }
            >
              {active ? (
                <span
                  className="absolute -top-3 left-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase"
                  style={{
                    background: BRAND_GRADIENT,
                    color: BRAND_GRADIENT_TEXT,
                    letterSpacing: "0.12em",
                    boxShadow: `0 4px 12px ${BRAND_GRADIENT_START}55`,
                  }}
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                    <path d="M8 1l2 4.6 5 .7-3.6 3.5.85 5L8 12.5 3.75 14.8l.85-5L1 6.3l5-.7L8 1z" />
                  </svg>
                  Für Sie relevant
                </span>
              ) : null}

              <div className={`flex items-center gap-3 ${active ? "mb-4" : "mb-3"} mt-1`}>
                <div
                  className={`rounded-xl flex items-center justify-center ${active ? "w-11 h-11" : "w-9 h-9"}`}
                  style={{
                    background: active ? `${ACCENT}1F` : "#ffffff",
                    color: active ? "#0a7a8c" : "#6b7280",
                    border: active ? "none" : "1px solid #e5e7eb",
                  }}
                >
                  <PlatformIconBox platform={p.key} />
                </div>
                <h3
                  className={`font-bold tracking-tight ${active ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}
                  style={{ color: TEXT_PRIMARY }}
                >
                  {p.name}
                </h3>
              </div>

              <p
                className={`leading-relaxed ${active ? "text-sm sm:text-[15px] mb-5" : "text-[13px] sm:text-sm mb-3"}`}
                style={{ color: TEXT_SECONDARY }}
              >
                {p.audience}
              </p>

              <p
                className={`uppercase font-bold ${active ? "text-[11px] mb-2.5" : "text-[10px] mb-2"}`}
                style={{ color: TEXT_PRIMARY, letterSpacing: "0.14em" }}
              >
                Geeignet für
              </p>
              <ul className={`${active ? "space-y-2 mb-5" : "space-y-1.5 mb-3"}`}>
                {platformGoodForByLeadType(p, leadType).map((g, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2.5 ${active ? "text-sm" : "text-[12px] sm:text-[13px]"}`}
                    style={{ color: TEXT_PRIMARY }}
                  >
                    <span
                      className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: active ? ACCENT : "#9ca3af" }}
                      aria-hidden="true"
                    />
                    {g}
                  </li>
                ))}
              </ul>

              <div
                className={`rounded-lg leading-snug mt-auto ${active ? "px-3.5 py-2.5 text-xs sm:text-sm" : "px-3 py-2 text-[11px] sm:text-xs"}`}
                style={{ background: "#ffffff", color: TEXT_SECONDARY, border: "1px solid #ecedef" }}
              >
                <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>Weniger passend:</span>{" "}
                {p.notFor}
              </div>
            </article>
          );
        })}
        {/* Tail-Spacer damit beim ganz-nach-rechts-Scrollen Symmetrie zur linken Seite besteht */}
        <div className="shrink-0 w-1 sm:w-3" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Case-Study-Card
// ─────────────────────────────────────────────
function CaseStudyCard({
  caseStudy,
  imageOverflow = false,
}: {
  caseStudy: CaseStudy;
  imageOverflow?: boolean;
}) {
  // Im imageOverflow-Modus (Branding/Organic):
  // - Hero ragt aus der Card hinaus (negative margin-top)
  // - Aspect-Ratio ist offen, damit Phone-Screenshot-Collagen vollstaendig
  //   sichtbar sind (kein Crop)
  // - Card overflow: visible damit das Bild oben rausgucken kann
  // - Extra padding-top am Card-Container damit der Overlap-Spielraum hat
  return (
    <article
      className={`rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-md flex flex-col h-full ${
        imageOverflow ? "" : "overflow-hidden"
      }`}
      style={{
        background: BG_LIGHT,
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        paddingTop: imageOverflow ? "32px" : 0,
      }}
    >
      {caseStudy.heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={caseStudy.heroImage}
          alt={caseStudy.firmenname}
          loading="lazy"
          className="w-full select-none"
          draggable={false}
          style={
            imageOverflow
              ? {
                  marginTop: "-60px",
                  marginBottom: "12px",
                  objectFit: "contain",
                  borderRadius: "12px",
                  background: "transparent",
                }
              : {
                  aspectRatio: "16/9",
                  objectFit: "cover",
                }
          }
        />
      ) : (
        <div
          className="w-full flex items-center justify-center"
          style={{ aspectRatio: "16/9", background: "#ffffff", color: TEXT_SECONDARY }}
        >
          <span className="text-xs uppercase tracking-widest">{caseStudy.firmenname}</span>
        </div>
      )}
      <div className="p-6 flex flex-col flex-1">
        <h3 className="font-bold text-lg mb-1" style={{ color: TEXT_PRIMARY }}>
          {caseStudy.firmenname}
        </h3>
        <p className="text-[11px] uppercase mb-4 font-semibold" style={{ color: TEXT_SECONDARY, letterSpacing: "0.10em" }}>
          {caseStudy.branche} · {caseStudy.typ}
        </p>
        <p className="text-sm mb-6 flex-1" style={{ color: TEXT_SECONDARY, lineHeight: 1.6 }}>
          {caseStudy.kurzbeschreibung}
        </p>
        {caseStudy.metrics && caseStudy.metrics.length > 0 ? (
          <div
            className="mt-auto rounded-xl overflow-hidden"
            style={{ background: "#ffffff", border: "1px solid #ecedef" }}
          >
            {caseStudy.metrics.slice(0, 3).map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3"
                style={{
                  borderTop: i === 0 ? "none" : "1px solid #f1f2f4",
                }}
              >
                <div
                  className="font-bold shrink-0"
                  style={{
                    color: ACCENT,
                    fontSize: "1.15rem",
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                    minWidth: "4.5rem",
                  }}
                >
                  {m.value}
                </div>
                <div
                  className="text-[13px] sm:text-sm"
                  style={{
                    color: TEXT_SECONDARY,
                    lineHeight: 1.4,
                    wordBreak: "normal",
                  }}
                >
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function WeitereReferenzenCard({ slug }: { slug: string }) {
  return (
    <a
      href={buildReferencesUrl(slug)}
      data-pitch-cta="weitere_referenzen"
      className="rounded-2xl p-6 flex flex-col items-start justify-center transition-all duration-300 hover:-translate-y-1 h-full"
      style={{
        background: BG_LIGHT,
        border: `1px dashed ${ACCENT}`,
        color: TEXT_PRIMARY,
      }}
    >
      <span className="text-lg sm:text-xl font-bold mb-2">Weitere Referenzen</span>
      <span className="text-sm mb-4" style={{ color: TEXT_SECONDARY }}>
        Über das Formular bekommt ihr weitere passende Cases per Mail zugeschickt.
      </span>
      <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: ACCENT }}>
        Anfragen →
      </span>
    </a>
  );
}

function VorgehenCard({ block, index }: { block: PitchVorgehenBlock; index: number }) {
  const Icon = vorgehenIconFor(index);
  return (
    <article
      className="rounded-2xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col h-full"
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${ACCENT}1F`, color: "#0a7a8c" }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs uppercase font-bold" style={{ color: TEXT_SECONDARY, letterSpacing: "0.08em" }}>
          {block.zeitraum}
        </span>
      </div>
      <h3 className="font-semibold text-lg mb-3" style={{ color: TEXT_PRIMARY }}>
        {block.titel}
      </h3>
      <ul className="space-y-2 text-sm" style={{ color: TEXT_SECONDARY }}>
        {block.bullets.slice(0, 5).map((b, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: ACCENT }}
              aria-hidden="true"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// ─────────────────────────────────────────────
// Hero Phone-Mockup mit Loop-Video
// Echter iPhone-Frame als PNG-Overlay (public/Mockups/Mobile.png, 958x1920 mit
// transparenter Screen-Mitte). Video liegt darunter im Screen-Bereich.
// Insets sind prozentual auf die Mockup-Maße kalibriert — nicht hardcoded px,
// damit der Mockup auf jeder Container-Breite skaliert.
// ─────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div
      className="relative"
      style={{
        width: "min(300px, 100%)",
        aspectRatio: "958 / 1920",
      }}
    >
      {/* Glow hinter dem Phone */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${ACCENT}28, transparent 70%)`,
          filter: "blur(60px)",
          transform: "scale(1.3)",
        }}
        aria-hidden="true"
      />

      {/* Schwarzer Screen-Layer hinter dem Video (falls Video nicht laedt) */}
      <div
        className="absolute"
        style={{
          // Insets kalibriert auf das Mobile.png-Frame:
          // links/rechts ca. 4% Gehaeuse, oben/unten ca. 1.5% Gehaeuse-Rand
          top: "1.8%",
          bottom: "1.8%",
          left: "4.5%",
          right: "4.5%",
          background: "#000000",
          borderRadius: "38px",
          overflow: "hidden",
        }}
      >
        <video
          className="block w-full h-full"
          style={{ objectFit: "cover" }}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Beispiel-Video unserer Arbeit"
        >
          <source src="/videos/HeroVideo.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Frame-Overlay (transparente Mitte, sichtbare Phone-Kanten) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Mockups/Mobile.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        draggable={false}
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// Mid-CTA — zwischen Case Studies und Google Reviews
// Kompakter Banner mit Brand-Gradient. Frage als Headline statt Statement,
// weil der Lead an diesem Punkt entscheidet ob Case Studies sein Problem treffen.
// ─────────────────────────────────────────────
function MidCTASection() {
  return (
    <section
      data-pitch-section="mid_cta"
      className="py-10 sm:py-14"
      style={{ background: "#ffffff" }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-8 sm:px-10 sm:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
          style={{
            background: BRAND_GRADIENT,
            boxShadow: `0 12px 40px ${BRAND_GRADIENT_START}40`,
          }}
        >
          <div className="flex-1">
            <h3
              className="font-bold tracking-tight mb-2"
              style={{ color: BRAND_GRADIENT_TEXT, fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)", lineHeight: 1.2 }}
            >
              Klingt das nach einer Lösung für Sie?
            </h3>
            <p className="text-sm sm:text-base" style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
              15 Minuten reichen für ein erstes Gespräch, ohne Verpflichtung.
            </p>
          </div>
          <a
            href={CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-pitch-cta="mid_termin"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-semibold transition-transform hover:-translate-y-0.5 shrink-0"
            style={{ background: "#ffffff", color: "#0f1115" }}
          >
            Kalendertermin buchen
          </a>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// Final-CTA — letzter Aufruf vor dem Footer
// Schwarzer Hintergrund mit subtilem Brand-Glow unten, Lead-Type-abhängige Headline.
// ─────────────────────────────────────────────
function FinalCTASection({ leadType }: { leadType: PitchLeadType | null }) {
  const headlines: Record<PitchLeadType | "default", string> = {
    recruiting: "Bereit, Ihr Team zu verstärken?",
    leadgen:    "Bereit für neue Kunden?",
    branding:   "Bereit für mehr Sichtbarkeit?",
    mixed:      "Bereit, loszulegen?",
    default:    "Bereit, loszulegen?",
  };

  return (
    <section
      data-pitch-section="final_cta"
      className="relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 60% 70% at 50% 100%, ${ACCENT}28, transparent 70%), #0f1115`,
        padding: "clamp(5rem, 10vw, 7rem) 0",
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-[500px] pointer-events-none opacity-50"
        style={{
          background: `radial-gradient(circle at 50% 100%, ${BRAND_GRADIENT_START}40 0%, transparent 60%)`,
          filter: "blur(80px)",
        }}
        aria-hidden="true"
      />
      <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
        <h2
          className="font-bold tracking-tight mb-5"
          style={{
            color: "#ffffff",
            fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
          }}
        >
          {headlines[leadType ?? "default"]}
        </h2>
        <p
          className="mb-10 max-w-md mx-auto text-base sm:text-lg"
          style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}
        >
          15 Minuten reichen für ein erstes Gespräch. Wir zeigen Ihnen wie das konkret bei Ihnen aussieht.
        </p>
        <a
          href={CALENDLY_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-pitch-cta="final_termin"
          className="inline-flex items-center gap-2 font-semibold transition-all duration-200 hover:-translate-y-0.5"
          style={{
            background: BRAND_GRADIENT,
            color: BRAND_GRADIENT_TEXT,
            padding: "1rem 2.5rem",
            borderRadius: "999px",
            fontSize: "1rem",
            boxShadow: `0 8px 28px ${BRAND_GRADIENT_START}60`,
          }}
        >
          Kalendertermin buchen
        </a>
        <p className="mt-6 text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Kein Risiko, kein Vertrag, kein Bullshit.
        </p>
      </div>
    </section>
  );
}

// Hilfsexport gegen unused-Warning (Kontakt wird in alten Footer-Versionen genutzt)
void CONTACT;
