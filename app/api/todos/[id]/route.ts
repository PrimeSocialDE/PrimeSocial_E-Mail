import { NextRequest, NextResponse } from "next/server";
import { setTodoCompleted } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 5;

// PATCH /api/todos/[id]  body: { completed: boolean }
// Toggle ToDo zwischen offen und abgehakt. Body { completed: true } setzt
// completed_at = jetzt, { completed: false } setzt completed_at = null
// (Undo, falls man versehentlich abgehakt hat).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const completed = body.completed === true;
    await setTodoCompleted(id, completed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
