import { NextRequest, NextResponse } from "next/server";
import { createServerAuthClient } from "@/lib/supabase-server";
import { setzeSequenzStatus, getZielfirmaIdVonEntwurf } from "@/lib/stellensignale/db";
import type { EntwurfStatus } from "@/types/stellensignale";

// Status einer SEQUENZ ändern: freigegeben | verworfen | entwurf.
//
// Freigabe-Modell A: Ein Klick betrifft alle drei Schritte der Firma, nicht nur
// den angeklickten Entwurf. Bei 30 Mails am Tag wären Einzelfreigaben 90 Klicks.
// Bereits versendete Schritte bleiben unverändert.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERLAUBT: EntwurfStatus[] = ["entwurf", "freigegeben", "verworfen"];

export async function POST(req: NextRequest) {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
  if (!body.id || !body.status || !ERLAUBT.includes(body.status as EntwurfStatus)) {
    return NextResponse.json({ error: "id + gültiger status nötig" }, { status: 400 });
  }
  try {
    const zielfirmaId = await getZielfirmaIdVonEntwurf(body.id);
    if (!zielfirmaId) return NextResponse.json({ error: "Entwurf nicht gefunden" }, { status: 404 });
    const geaendert = await setzeSequenzStatus(zielfirmaId, body.status as EntwurfStatus);
    return NextResponse.json({ ok: true, geaendert });
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
