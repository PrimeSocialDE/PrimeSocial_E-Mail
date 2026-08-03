import { NextRequest, NextResponse } from "next/server";
import { getDraftsForLead, updateDraft, getLead } from "@/lib/supabase";
import { generateAndSaveAllDrafts } from "@/lib/sequences";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const drafts = await getDraftsForLead(id);
    return NextResponse.json(drafts);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Sequenzen neu generieren
  try {
    const { id } = await params;
    const lead = await getLead(id);
    const drafts = await generateAndSaveAllDrafts(lead);
    return NextResponse.json(drafts);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;
    const body = await req.json();
    const { draftId, ...updates } = body as { draftId: string } & Record<string, unknown>;
    if (!draftId) return NextResponse.json({ error: "draftId fehlt" }, { status: 400 });
    void leadId; // Sicherheit: könnte hier geprüft werden ob Draft zu Lead gehört
    const updated = await updateDraft(draftId, updates);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
