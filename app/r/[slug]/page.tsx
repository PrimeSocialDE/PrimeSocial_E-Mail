import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPitchPageBySlug } from "@/lib/supabase";
import { ReferencesRequestForm } from "@/components/ReferencesRequestForm";
import { BRAND_COLOR } from "@/lib/pitch-constants";

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: "Weitere Referenzen · PrimeSocial",
};

export const dynamic = "force-dynamic";

const ACCENT = BRAND_COLOR;
const TEXT_PRIMARY = "#0f1117";
const TEXT_SECONDARY = "#6b7280";
const BG_LIGHT = "#f7f8fa";

export default async function ReferencesRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pitch = await getPitchPageBySlug(slug);
  if (!pitch) notFound();

  const company = pitch.company_name_display ?? "";

  return (
    <div
      className="min-h-screen"
      style={{ background: BG_LIGHT, color: TEXT_PRIMARY, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <header className="border-b" style={{ background: "#ffffff", borderColor: "#e5e7eb" }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between px-5 sm:px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="font-bold tracking-tight text-lg">
              Prime<span style={{ color: ACCENT }}>Social</span>
            </span>
            {company ? (
              <>
                <span className="text-gray-300" aria-hidden="true">×</span>
                <span className="font-semibold text-base">{company}</span>
              </>
            ) : null}
          </div>
          <Link
            href={`/p/${slug}`}
            className="text-sm"
            style={{ color: TEXT_SECONDARY }}
          >
            ← Zurück zum Konzept
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Weitere Referenzen anfragen</h1>
        <p className="text-lg mb-10" style={{ color: TEXT_SECONDARY }}>
          Lass uns deine Kontaktdaten da. Wir rufen dich kurz zurück und zeigen dir Fallbeispiele, die zu deiner Situation passen. Kein Verkaufsgespräch, nur konkrete Cases.
        </p>
        <ReferencesRequestForm slug={slug} />
      </main>

      <footer className="border-t" style={{ borderColor: "#e5e7eb", background: "#ffffff" }}>
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm" style={{ color: TEXT_SECONDARY }}>
          <span>
            Prime<span style={{ color: ACCENT }}>Social</span> © {new Date().getFullYear()}
          </span>
          <nav className="flex gap-5">
            <a href="https://www.primesocial.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:underline">Impressum</a>
            <a href="https://www.primesocial.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:underline">Datenschutz</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
