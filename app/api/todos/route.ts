import { NextResponse } from "next/server";
import { getOpenTodos } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todos = await getOpenTodos();
    return NextResponse.json({ todos });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
