import { NextRequest, NextResponse } from "next/server";
import { getLeads, getSegmentWorkflowStats, getPromptOverride } from "@/lib/supabase";
import { getStepRules } from "@/lib/segments";
import { WORKFLOW_STEPS } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SLUG_TO_SEGMENT: Record<string, string> = {
  inaktiv:         "INAKTIV",
  inkonsistent:    "INKONSISTENT",
  keinevideo:      "KEINEVIDEO",
  wenigreichweite: "WENIGREICHWEITE",
  viralausreisser: "VIRALAUSREISSER",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ segment: string }> }) {
  try {
    const { segment: slug } = await params;
    const segment = SLUG_TO_SEGMENT[slug];
    if (!segment) return NextResponse.json({ error: "Unbekanntes Segment" }, { status: 404 });

    const [stats, leads] = await Promise.all([
      getSegmentWorkflowStats(segment),
      getLeads({ segment }),
    ]);

    // Prompt overrides + defaults für alle Steps laden
    const steps = await Promise.all(
      WORKFLOW_STEPS.map(async (s) => {
        const customRules = await getPromptOverride(segment, s.step);
        const defaultRules = getStepRules(s.step, segment);
        return {
          ...s,
          defaultRules,
          customRules,
          stats: stats.steps[s.step] ?? { sent: 0, opened: 0, clicked: 0, bounced: 0 },
        };
      })
    );

    // Aggregate stats
    const totalSent    = Object.values(stats.steps).reduce((s, v) => s + v.sent, 0);
    const totalOpened  = Object.values(stats.steps).reduce((s, v) => s + v.opened, 0);
    const totalClicked = Object.values(stats.steps).reduce((s, v) => s + v.clicked, 0);

    return NextResponse.json({
      segment,
      leads: stats.leads,
      aggregate: {
        totalSent,
        openRate:  totalSent > 0 ? Math.round((totalOpened  / totalSent) * 100) : 0,
        clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
      },
      steps,
      recentLeads: leads.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
