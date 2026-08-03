import { NextRequest, NextResponse } from "next/server";
import { getNewsletter, updateNewsletter } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nl = await getNewsletter(id);
    if (!nl) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json(nl);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await req.json();
    const nl = await updateNewsletter(id, updates);
    return NextResponse.json(nl);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
