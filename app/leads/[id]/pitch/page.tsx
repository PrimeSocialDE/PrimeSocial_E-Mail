import Link from "next/link";
import { notFound } from "next/navigation";
import { getLead, getPitchPageByLeadId, getPitchPageEvents, getActiveGoogleReviews } from "@/lib/supabase";
import { PITCH_EXCLUDED_SEGMENTS } from "@/types";
import { PitchContent } from "@/components/PitchContent";
import { PitchManagementControls } from "@/components/PitchManagementControls";
import { CASE_STUDIES, matchCaseStudies, buildPitchUrl } from "@/lib/pitch-constants";

export const dynamic = "force-dynamic";

export default async function LeadPitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let lead;
  try {
    lead = await getLead(id);
  } catch {
    notFound();
  }

  const pitch = await getPitchPageByLeadId(id);
  const excluded = lead.segment ? PITCH_EXCLUDED_SEGMENTS.includes(lead.segment) : false;

  const events = pitch ? await getPitchPageEvents(pitch.id) : [];
  const uniqueSessions = new Set(events.map((e) => e.session_id)).size;

  const publicUrl = pitch?.status === "published" ? buildPitchUrl(pitch.slug) : null;

  const selectedCases = pitch?.case_studies_keys && pitch.case_studies_keys.length > 0
    ? CASE_STUDIES.filter((cs) => pitch.case_studies_keys!.includes(cs.key))
    : matchCaseStudies(pitch?.focus_area ?? null, pitch?.content_examples_branche);
  const resolvedCases = selectedCases.length > 0 ? selectedCases : CASE_STUDIES.slice(0, 2);
  const googleReviews = pitch ? await getActiveGoogleReviews().catch(() => []) : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/leads/${id}`} className="text-gray-400 hover:text-gray-200">← Zurück zum Lead</Link>
        <span className="text-gray-600">/</span>
        <span className="text-gray-400">{lead.company_name}</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pitch-Seite</h1>
        <p className="text-gray-400 mt-1">
          Individualisierte Micro-Pitch-Seite für {lead.company_name}. Wird einmal generiert und dann nicht automatisch verändert. Manuelle Edits sind möglich.
        </p>
      </div>

      <PitchManagementControls
        leadId={id}
        hasPitch={!!pitch}
        pitchStatus={pitch?.status ?? null}
        publicUrl={publicUrl}
        excluded={excluded}
      />

      {pitch ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <MetricCard label="Views" value={pitch.views.toString()} />
            <MetricCard label="Unique Sessions" value={uniqueSessions.toString()} />
            <MetricCard
              label="Ø Scroll-Tiefe"
              value={pitch.views > 0 ? `${Math.round(pitch.total_scroll_depth / pitch.views)}%` : "—"}
            />
            <MetricCard label="CTA-Klicks" value={pitch.cta_clicks.toString()} />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3">Vorschau</h2>
            <div className="rounded-2xl overflow-hidden border border-[#333]">
              <PitchContent pitch={pitch} caseStudies={resolvedCases} googleReviews={googleReviews} />
            </div>
          </div>
        </>
      ) : (
        <div className="card p-8 text-center text-gray-400">
          {excluded
            ? "Segment-Ausschluss aktiv — keine Pitch-Seite für dieses Segment."
            : 'Noch keine Pitch-Seite vorhanden. Klicke oben auf "Generieren", um eine individualisierte Seite zu erstellen.'}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}
