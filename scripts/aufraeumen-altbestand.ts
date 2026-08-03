/**
 * Räumt den Altbestand auf, der vor den heutigen Filtern importiert wurde.
 *
 *   1. Firmen gegen die Ausschlussliste prüfen → status='gesperrt'
 *      (Konzerne, Personaldienstleister). Löscht NICHTS.
 *   2. Entwürfe von gesperrten Firmen und von Firmen unter der
 *      Erreichbarkeits-Schwelle auf 'verworfen' setzen, damit sie im
 *      Dashboard nicht versehentlich freigegeben werden können.
 *      Bereits VERSENDETE Entwürfe bleiben unangetastet.
 *
 * Aufruf:
 *   npx tsx scripts/aufraeumen-altbestand.ts --dry   # nur zeigen
 *   npx tsx scripts/aufraeumen-altbestand.ts         # ausführen
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { istAusgeschlossen } from "../lib/stellensignale/filter";
import { erreichbarkeit, mindestScore } from "../lib/stellensignale/erreichbarkeit";
import type { FirmaOutreach, Zielfirma } from "../types/stellensignale";

const dryRun = process.argv.includes("--dry");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function run() {
  console.log(`\n🧹 Altbestand aufräumen${dryRun ? "  (DRY RUN — nichts wird geschrieben)" : ""}\n`);

  // ── 1. Ausgeschlossene Firmen sperren ──
  const { data: fRaw, error: fErr } = await db.from("zielfirmen").select("*").eq("status", "aktiv");
  if (fErr) throw fErr;
  const firmen = (fRaw ?? []) as Zielfirma[];

  const zuSperren = firmen
    .map((f) => ({ f, grund: istAusgeschlossen(f.firma) }))
    .filter((x): x is { f: Zielfirma; grund: string } => x.grund !== null);

  console.log(`── Firmen: ${firmen.length} aktiv, ${zuSperren.length} auszuschließen ──`);
  for (const { f, grund } of zuSperren) console.log(`   ⛔ ${f.firma}  (${grund})`);

  if (!dryRun && zuSperren.length > 0) {
    const { error } = await db.from("zielfirmen")
      .update({ status: "gesperrt" })
      .in("id", zuSperren.map((x) => x.f.id));
    if (error) throw error;
    console.log(`   → ${zuSperren.length} auf 'gesperrt' gesetzt (nichts gelöscht)`);
  }

  // ── 2. Entwürfe prüfen ──
  const gesperrteIds = new Set(zuSperren.map((x) => x.f.id));
  const { data: oRaw } = await db.from("v_firma_outreach").select("*");
  const outreach = new Map(((oRaw ?? []) as FirmaOutreach[]).map((o) => [o.zielfirma_id, o]));

  const { data: eRaw, error: eErr } = await db
    .from("stellen_entwuerfe")
    .select("id, zielfirma_id, schritt, status, gesendet_at, zielfirmen(firma)")
    .eq("status", "entwurf")
    .is("gesendet_at", null);
  if (eErr) throw eErr;

  const min = mindestScore();
  type Zeile = { id: string; zielfirma_id: string; schritt: number; zielfirmen?: { firma?: string } | { firma?: string }[] };
  const verwerfen: { id: string; firma: string; grund: string }[] = [];

  for (const e of (eRaw ?? []) as unknown as Zeile[]) {
    const fk = Array.isArray(e.zielfirmen) ? e.zielfirmen[0] : e.zielfirmen;
    const name = fk?.firma ?? "—";
    if (gesperrteIds.has(e.zielfirma_id)) {
      verwerfen.push({ id: e.id, firma: name, grund: "Firma ausgeschlossen" });
      continue;
    }
    const o = outreach.get(e.zielfirma_id);
    if (!o) { verwerfen.push({ id: e.id, firma: name, grund: "nicht mehr in v_firma_outreach" }); continue; }
    const s = erreichbarkeit(o);
    if (s.score < min) {
      verwerfen.push({ id: e.id, firma: name, grund: `Erreichbarkeit ${s.score} < ${min}: ${s.gruende[0] ?? ""}` });
    }
  }

  // Nach Firma zusammenfassen — drei Schritte je Firma sonst dreifach gelistet.
  const proFirma = new Map<string, string>();
  for (const v of verwerfen) if (!proFirma.has(v.firma)) proFirma.set(v.firma, v.grund);

  console.log(`\n── Entwürfe: ${verwerfen.length} Einzelmails von ${proFirma.size} Firma(en) zu verwerfen ──`);
  for (const [firma, grund] of proFirma) console.log(`   ⛔ ${firma}\n      ${grund}`);

  if (!dryRun && verwerfen.length > 0) {
    const { error } = await db.from("stellen_entwuerfe")
      .update({ status: "verworfen" })
      .in("id", verwerfen.map((v) => v.id));
    if (error) throw error;
    console.log(`   → ${verwerfen.length} Entwürfe auf 'verworfen' gesetzt`);
  }

  // ── 3. Was bleibt ──
  const { data: rest } = await db
    .from("stellen_entwuerfe")
    .select("zielfirma_id, zielfirmen(firma)")
    .eq("status", "entwurf").eq("schritt", 1).is("gesendet_at", null);
  const uebrig = new Set(((rest ?? []) as unknown as Zeile[]).map((r) => {
    const fk = Array.isArray(r.zielfirmen) ? r.zielfirmen[0] : r.zielfirmen;
    return fk?.firma ?? "—";
  }));
  console.log(`\n✅ ${uebrig.size} Sequenz(en) bleiben zur Freigabe:`);
  for (const f of uebrig) console.log(`      · ${f}`);
  console.log(dryRun ? "\n   DRY RUN beendet.\n" : "\n   https://mail.primesocial.de/stellensignale/entwuerfe\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
