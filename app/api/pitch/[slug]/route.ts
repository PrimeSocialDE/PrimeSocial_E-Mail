import { NextRequest, NextResponse } from "next/server";
import { getPitchPage, getPitchPageBySlug, updatePitchPage } from "@/lib/supabase";
import type { PitchPage } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// UUID-Format-Check, damit die Route sowohl mit Pitch-Page-ID als auch mit Slug
// aufgerufen werden kann (early-stage interne Tools nutzen UUID, neuere URLs Slug).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePitch(slugOrId: string): Promise<PitchPage | null> {
  if (UUID_RE.test(slugOrId)) {
    return await getPitchPage(slugOrId);
  }
  return await getPitchPageBySlug(slugOrId);
}

// GET: Einzelne Pitch-Seite (für interne Vorschau/Editor)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const pitch = await resolvePitch(slug);
    if (!pitch) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ pitch });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH: Manuelle Edits am generierten Inhalt (nur Content-Felder, keine Stats)
const EDITABLE_FIELDS: (keyof PitchPage)[] = [
  "hero_headline",
  "hero_subline_accent",
  "hero_text",
  "hero_meta",
  "konzept_blocks",
  "content_strategie_blocks",
  "case_studies_keys",
  "vorgehen_blocks",
  "cta_headline",
  "cta_text",
  "company_name_display",
  "status",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const pitch = await resolvePitch(slug);
    if (!pitch) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

    const body = (await request.json()) as Partial<PitchPage>;
    const updates: Partial<PitchPage> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) {
        (updates as Record<string, unknown>)[key] = body[key];
      }
    }

    const updated = await updatePitchPage(pitch.id, updates);
    return NextResponse.json({ pitch: updated });
  } catch (e) {
    console.error("[pitch/patch]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
