import { NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import { sperreAusgeschlosseneFirmen } from "@/lib/stellensignale/db";

// Sortiert bereits vorhandene Konzerne/Personaldienstleister aus:
// setzt status='gesperrt' (löscht NICHTS). Auth-Pflicht.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

  try {
    const result = await sperreAusgeschlosseneFirmen();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
