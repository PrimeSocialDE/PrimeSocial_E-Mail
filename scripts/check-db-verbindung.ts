/**
 * REINER LESETEST der Supabase-Verbindung.
 *
 * Führt ausschließlich Zählabfragen aus (SELECT count(*)). Kein INSERT,
 * kein UPDATE, kein DELETE — dieses Skript kann per Konstruktion nichts
 * verändern.
 *
 * Aufruf: npx tsx scripts/check-db-verbindung.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

// Tabellen des Stellensignal-Moduls plus die des bestehenden Systems — so ist
// auf einen Blick sichtbar, ob die Migration lief und was schon an Daten da ist.
const TABELLEN = [
  "zielfirmen",
  "stellen_signale",
  "stellen_entwuerfe",
  "stellen_suppression",
  "blacklist_inserenten",
  "primesocial_leads",
];

async function run() {
  console.log("\n🔌 Supabase-Verbindung\n");
  console.log(`   URL: ${url || "(fehlt)"}`);
  console.log(`   Service-Role-Key: ${service ? `${service.length} Zeichen` : "(fehlt)"}`);
  console.log(`   Anon-Key: ${anon ? `${anon.length} Zeichen` : "(fehlt)"}\n`);

  if (!url.startsWith("https://")) {
    console.log("❌ URL beginnt nicht mit https:// — der Code würde Supabase als");
    console.log("   nicht konfiguriert ansehen und still auf eine lokale JSON-Datei");
    console.log("   zurückfallen.\n");
    process.exit(1);
  }
  const key = service || anon;
  if (!key) {
    console.log("❌ Kein Schlüssel gesetzt.\n");
    process.exit(1);
  }
  if (!service) {
    console.log("⚠️  Nur der Anon-Key ist gesetzt. Die Tabellen haben RLS aktiv und");
    console.log("   keine Policies — mit dem Anon-Key sind sie deshalb nicht lesbar.");
    console.log("   Das ist so gewollt; produktiv nutzt die App den Service-Role-Key.\n");
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  let fehler = 0;
  for (const t of TABELLEN) {
    const { count, error } = // "*" statt "id": stellen_suppression hat email als Primaerschluessel
    // und gar keine id-Spalte — eine Abfrage auf id schlaegt dort fehl.
    await db.from(t).select("*", { count: "exact", head: true });
    if (error) {
      const grund =
        /does not exist|schema cache/i.test(error.message) ? "Tabelle existiert nicht"
        : /permission|denied|JWT|policy/i.test(error.message) ? "kein Zugriff (RLS/Schlüssel)"
        : error.message.slice(0, 70);
      console.log(`   ❌ ${t.padEnd(22)} ${grund}`);
      fehler++;
    } else {
      console.log(`   ✅ ${t.padEnd(22)} ${String(count ?? 0).padStart(6)} Zeilen`);
    }
  }

  // Die View, aus der die Entwuerfe gespeist werden — der eigentliche Test,
  // ob die Migration vollstaendig durchlief.
  const { error: viewErr, count: viewCount } = await db
    .from("v_firma_outreach").select("*", { count: "exact", head: true });
  console.log(
    viewErr
      ? `   ❌ ${"v_firma_outreach".padEnd(22)} ${viewErr.message.slice(0, 70)}`
      : `   ✅ ${"v_firma_outreach".padEnd(22)} ${String(viewCount ?? 0).padStart(6)} ansprechbare Firmen`,
  );

  // Prüfen, ob die Versand-Migration von gestern wirklich angekommen ist.
  const { error: spaltenErr } = await db
    .from("stellen_entwuerfe").select("gesendet_at, ses_message_id, versuche").limit(1);
  console.log(
    spaltenErr
      ? `\n   ⚠️  Versand-Spalten fehlen — Migration 20260728 nicht eingespielt?`
      : `\n   ✅ Versand-Spalten vorhanden (Migration 20260728 ist drin)`,
  );

  // Sequenz-Migration (20260803): schritt + faellig_am.
  const { data: seq, error: seqErr } = await db
    .from("stellen_entwuerfe").select("schritt, status, faellig_am");
  if (seqErr) {
    console.log("   ⚠️  Sequenz-Spalten fehlen — Migration 20260803 nicht eingespielt?");
  } else {
    console.log("   ✅ Sequenz-Spalten vorhanden (Migration 20260803 ist drin)");
    const proSchritt = new Map<string, number>();
    for (const r of (seq ?? []) as { schritt: number; status: string }[]) {
      const k = `Schritt ${r.schritt} · ${r.status}`;
      proSchritt.set(k, (proSchritt.get(k) ?? 0) + 1);
    }
    for (const [k, v] of [...proSchritt].sort()) console.log(`      ${String(v).padStart(4)} × ${k}`);
  }

  console.log(fehler === 0 ? "\n✨ Verbindung steht.\n" : `\n⚠️  ${fehler} Tabelle(n) nicht erreichbar.\n`);
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
