import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead, getPitchPageByLeadId, createPitchPage, updatePitchPage } from "@/lib/supabase";
import { generatePitchPageContent } from "@/lib/anthropic";
import { PITCH_EXCLUDED_SEGMENTS } from "@/types";
import { generatePitchSlug, matchCaseStudies } from "@/lib/pitch-constants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLead(id);

    if (lead.segment && PITCH_EXCLUDED_SEGMENTS.includes(lead.segment)) {
      return NextResponse.json(
        { error: `Segment ${lead.segment} bekommt keine Pitch-Seite.` },
        { status: 400 },
      );
    }

    const content = await generatePitchPageContent(lead);

    // Branche aus website_summary ableiten — simpel: erste Zeile/Satz
    const brancheHint = (lead.website_summary ?? "").split(/[.\n]/)[0].slice(0, 200);
    const matchedCases = matchCaseStudies(content.focus_area, brancheHint);

    const existing = await getPitchPageByLeadId(id);

    const base = {
      lead_id: id,
      focus_area: content.focus_area,
      focus_reasoning: content.focus_reasoning,
      lead_type: content.lead_type,
      third_card_type: content.third_card_type,
      platforms: content.platforms,
      platform_strategy: content.platform_strategy,
      hero_headline: content.hero_headline,
      hero_subline_accent: content.hero_subline_accent,
      hero_text: content.hero_text,
      hero_meta: content.hero_meta,
      konzept_blocks: content.konzept_blocks,
      // content_strategie_blocks wird nicht mehr generiert (LinkedIn-Struktur deprecated)
      content_strategie_blocks: null,
      content_examples_branche: brancheHint || null,
      case_studies_keys: matchedCases.map((c) => c.key),
      vorgehen_blocks: content.vorgehen_blocks,
      cta_headline: content.cta_headline,
      cta_text: content.cta_text,
      company_name_display: lead.company_name,
    };

    const pitch = existing
      ? await updatePitchPage(existing.id, { ...base, status: "draft" })
      : await createPitchPage({
          ...base,
          slug: generatePitchSlug(lead.company_name),
          status: "draft",
          published_at: null,
        });

    return NextResponse.json({ pitch });
  } catch (e) {
    console.error("[pitch/generate]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
