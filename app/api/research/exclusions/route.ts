import { NextRequest, NextResponse } from "next/server";
import { getExclusions, addExclusion, deleteExclusion } from "@/lib/research/db";

// UI-editierbare Ausschluss-Liste (Branchen, die nicht recherchiert werden).
export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const exclusions = await getExclusions();
    return NextResponse.json({ exclusions });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { term } = await req.json();
    if (!term || !String(term).trim()) {
      return NextResponse.json({ error: "Begriff fehlt" }, { status: 400 });
    }
    const exclusion = await addExclusion(String(term));
    return NextResponse.json({ exclusion }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    await deleteExclusion(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
