"use client";

import { useState } from "react";
import type { GoogleReview } from "@/types";
import { BRAND_COLOR, BRAND_GRADIENT_START } from "@/lib/pitch-constants";

// Premium Dark-Theme Testimonials — orientiert am PrimeSocial-Website-Stil.
const DARK_BG = "#0f1115";
const DARK_BG_DEEP = "#0a0c10";
const CARD_BG = "#171a21";
const CARD_BORDER = "rgba(255,255,255,0.08)";
const TEXT_ON_DARK = "#ffffff";
const TEXT_ON_DARK_MUTED = "rgba(255,255,255,0.6)";

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div className="flex gap-0.5" aria-label={`${rating} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 20 20" fill={n <= rating ? "#fbbf24" : "rgba(255,255,255,0.18)"} className={cls} aria-hidden="true">
          <path d="M10 1l2.928 5.926 6.541.95-4.735 4.612 1.118 6.512L10 16.327l-5.852 3.073 1.118-6.512L.531 8.276l6.541-.95L10 1z" />
        </svg>
      ))}
    </div>
  );
}

function IconUser({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5c0-3.9 3.4-7 7.5-7s7.5 3.1 7.5 7" />
    </svg>
  );
}

function GoogleLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase"
      style={{
        background: "rgba(137,223,237,0.12)",
        color: BRAND_COLOR,
        border: "1px solid rgba(137,223,237,0.25)",
        letterSpacing: "0.10em",
      }}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
        <path d="M8 .5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm3.5 5.7L7.1 10.6 4.5 8l1-1 1.6 1.6L10.5 5.2l1 1z" />
      </svg>
      Verifizierter Kunde
    </span>
  );
}

function ReviewCard({ review }: { review: GoogleReview }) {
  const dateLabel = review.review_date
    ? new Date(review.review_date).toLocaleDateString("de-DE", { year: "numeric", month: "long" })
    : "";

  return (
    <div
      className="rounded-2xl p-7 sm:p-8 h-full flex flex-col transition-all duration-300 hover:-translate-y-1"
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: `0 1px 2px rgba(0,0,0,0.4), 0 12px 32px rgba(0,0,0,0.25)`,
      }}
    >
      <div className="flex items-start gap-4 mb-5">
        <div className="relative shrink-0">
          {review.reviewer_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.reviewer_image_url}
              alt={review.reviewer_name}
              loading="lazy"
              className="w-14 h-14 rounded-full object-cover"
              style={{ border: `2px solid ${BRAND_COLOR}` }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: TEXT_ON_DARK_MUTED,
                border: `2px solid ${BRAND_COLOR}`,
              }}
              aria-hidden="true"
            >
              <IconUser className="w-7 h-7" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-base sm:text-lg" style={{ color: TEXT_ON_DARK }}>
                {review.reviewer_name}
              </div>
              <div className="text-xs sm:text-sm mt-0.5" style={{ color: BRAND_COLOR }}>
                Google-Bewertung
              </div>
            </div>
            <GoogleLogo className="w-5 h-5 shrink-0 mt-1" />
          </div>
          <div className="flex items-center gap-2.5 mt-2.5">
            <StarRow rating={review.rating} />
            {dateLabel ? (
              <span className="text-xs" style={{ color: TEXT_ON_DARK_MUTED }}>
                {dateLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative flex-1 mb-5">
        <svg
          viewBox="0 0 32 32"
          fill="currentColor"
          className="absolute -top-2 -left-1 w-7 h-7"
          style={{ color: BRAND_COLOR, opacity: 0.25 }}
          aria-hidden="true"
        >
          <path d="M6 10c0-3.3 2.7-6 6-6v3c-1.7 0-3 1.3-3 3h3v8H6V10zm12 0c0-3.3 2.7-6 6-6v3c-1.7 0-3 1.3-3 3h3v8h-6V10z" />
        </svg>
        <p className="text-[15px] sm:text-base leading-relaxed italic pl-7" style={{ color: TEXT_ON_DARK }}>
          {review.review_text}
        </p>
      </div>

      <div className="pt-4 mt-auto" style={{ borderTop: `1px solid ${CARD_BORDER}` }}>
        <VerifiedBadge />
      </div>
    </div>
  );
}

interface GoogleReviewsSectionProps {
  reviews: GoogleReview[];
}

export function GoogleReviewsSection({ reviews }: GoogleReviewsSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!reviews || reviews.length === 0) return null;

  const visibleCount = Math.min(reviews.length, 5);

  return (
    <section
      data-pitch-section="google_reviews"
      className="relative py-20 sm:py-28 overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${BRAND_GRADIENT_START}18, transparent 70%), ${DARK_BG}`,
      }}
    >
      <div
        className="absolute -bottom-32 -right-20 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${BRAND_COLOR}10 0%, transparent 60%)`,
          filter: "blur(80px)",
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex items-center gap-3 mb-3">
          <GoogleLogo className="w-6 h-6" />
          <p className="text-sm font-semibold" style={{ color: BRAND_COLOR }}>
            Google-Bewertungen
          </p>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4" style={{ color: TEXT_ON_DARK }}>
          Was andere über uns sagen
        </h2>
        <p className="text-lg mb-12 max-w-2xl" style={{ color: TEXT_ON_DARK_MUTED }}>
          {visibleCount} Bewertungen aus dem letzten Jahr. Alle echte Kunden.
        </p>

        <div className="hidden md:block -mx-5 sm:-mx-8">
          <div
            className="flex gap-5 overflow-x-auto px-5 sm:px-8 pb-4 snap-x snap-mandatory"
            style={{ scrollbarWidth: "thin" }}
          >
            {reviews.map((r) => (
              <div key={r.id} className="snap-start shrink-0 w-[380px]">
                <ReviewCard review={r} />
              </div>
            ))}
          </div>
        </div>

        <div className="md:hidden -mx-5">
          <div
            className="flex gap-4 overflow-x-auto px-5 pb-4 snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
            onScroll={(e) => {
              const target = e.currentTarget;
              const idx = Math.round(target.scrollLeft / (target.clientWidth - 40));
              if (idx !== activeIndex) setActiveIndex(idx);
            }}
          >
            {reviews.map((r) => (
              <div key={r.id} className="snap-start shrink-0 w-[88%]">
                <ReviewCard review={r} />
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2 mt-4">
            {reviews.map((_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{ background: i === activeIndex ? BRAND_COLOR : "rgba(255,255,255,0.18)" }}
              />
            ))}
          </div>
        </div>

        <div
          className="mt-14 inline-flex items-center gap-3 px-5 py-3 rounded-full"
          style={{ background: DARK_BG_DEEP, border: `1px solid ${CARD_BORDER}` }}
        >
          <StarRow rating={5} size="md" />
          <span className="text-base font-bold" style={{ color: TEXT_ON_DARK }}>
            4,9
          </span>
          <span className="w-px h-4" style={{ background: "rgba(255,255,255,0.15)" }} aria-hidden="true" />
          <span className="text-sm" style={{ color: TEXT_ON_DARK_MUTED }}>
            {reviews.length} Bewertungen auf Google
          </span>
        </div>
      </div>
    </section>
  );
}
