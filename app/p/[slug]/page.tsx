import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPitchPageBySlug, getActiveGoogleReviews, getLead } from "@/lib/supabase";
import { PitchContent } from "@/components/PitchContent";
import { PitchTracker } from "@/components/PitchTracker";
import { CASE_STUDIES, matchCaseStudies } from "@/lib/pitch-constants";

export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: "PrimeSocial",
};

export const dynamic = "force-dynamic";

export default async function PublicPitchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pitch = await getPitchPageBySlug(slug);
  if (!pitch || pitch.status !== "published") notFound();

  // Case Studies + Content Examples nach gespeicherten Keys/Focus+Branche auswählen
  const selectedCases = pitch.case_studies_keys && pitch.case_studies_keys.length > 0
    ? CASE_STUDIES.filter((cs) => pitch.case_studies_keys!.includes(cs.key))
    : matchCaseStudies(pitch.focus_area ?? null, pitch.content_examples_branche);
  const resolvedCases = selectedCases.length > 0 ? selectedCases : CASE_STUDIES.slice(0, 2);

  // Vorname aus Lead holen für persönlichen Header ("Vorbereitet für Joachim").
  // Bei Fehler oder fehlendem Lead bleibt es bei Firmenname-only.
  const lead = pitch.lead_id ? await getLead(pitch.lead_id).catch(() => null) : null;
  const contactFirstName = lead?.contact_first_name ?? null;

  const googleReviews = await getActiveGoogleReviews().catch(() => []);

  return (
    <>
      <PitchTracker slug={slug} />
      <PitchContent
        pitch={pitch}
        caseStudies={resolvedCases}
        googleReviews={googleReviews}
        contactFirstName={contactFirstName}
      />
    </>
  );
}
