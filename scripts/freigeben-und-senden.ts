/**
 * Gibt benannte Sequenzen frei und verschickt die fälligen Mails über die
 * ECHTE Pipeline — nicht per Direktversand.
 *
 * Wichtig: der Weg über sendeFreigegebene() sorgt dafür, dass
 *   • Tagesbudget und Warmup-Rampe greifen
 *   • die Suppression-Liste vor jedem Versand geprüft wird
 *   • Mail 2 und 3 terminiert werden
 *   • die Sequenz stoppt, sobald jemand antwortet
 * Ein Direktversand per Skript hätte nichts davon.
 *
 * Aufruf:
 *   npx tsx scripts/freigeben-und-senden.ts --dry    # Texte zeigen, nichts tun
 *   npx tsx scripts/freigeben-und-senden.ts          # freigeben + senden
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Fuer diesen Lauf scharf schalten. In Vercel muss das separat gesetzt werden,
// sonst laufen die Folgemails 2 und 3 spaeter nicht automatisch raus.
process.env.STELLENSIGNALE_VERSAND_ENABLED = "true";
process.env.SES_WARMUP_START ??= new Date().toISOString().slice(0, 10);

import { createClient } from "@supabase/supabase-js";
import { sendeFreigegebene, tagesbudget, imSendefenster } from "../lib/stellensignale/versand";

const dryRun = process.argv.includes("--dry");

/** Nur diese Firmen werden freigegeben. Bewusst namentlich, nicht "alle". */
const FREIGEBEN = ["MOIN SOLAR GmbH", "ABGtherm GmbH & Co. KG"];

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function run() {
  console.log(`\n📤 Freigeben und senden${dryRun ? "  (DRY RUN)" : ""}\n`);

  const { data: fRaw, error } = await db
    .from("zielfirmen").select("id, firma, email").in("firma", FREIGEBEN);
  if (error) throw error;
  const firmen = (fRaw ?? []) as { id: string; firma: string; email: string | null }[];

  if (firmen.length !== FREIGEBEN.length) {
    console.log(`⚠️  ${firmen.length} von ${FREIGEBEN.length} Firmen gefunden — bitte Namen prüfen.`);
  }

  // ── Die Texte zeigen ──
  for (const f of firmen) {
    const { data: eRaw } = await db.from("stellen_entwuerfe")
      .select("schritt, betreff, text, status")
      .eq("zielfirma_id", f.id).order("schritt");
    console.log(`${"═".repeat(70)}\n${f.firma}  →  ${f.email}\n`);
    for (const e of (eRaw ?? []) as { schritt: number; betreff: string; text: string; status: string }[]) {
      const wann = e.schritt === 1 ? "sofort" : e.schritt === 2 ? "+4 Tage" : "+7 Tage";
      console.log(`── Mail ${e.schritt} (${wann}) · Status: ${e.status}`);
      console.log(`   Betreff: ${e.betreff}`);
      console.log(e.text.split("\n").map((l) => `   │ ${l}`).join("\n"));
      console.log("");
    }
  }

  if (dryRun) {
    console.log("═".repeat(70));
    console.log("\nDRY RUN — nichts freigegeben, nichts versendet.\n");
    return;
  }

  // ── Freigeben ──
  console.log("═".repeat(70));
  for (const f of firmen) {
    const { data, error: uErr } = await db.from("stellen_entwuerfe")
      .update({ status: "freigegeben" })
      .eq("zielfirma_id", f.id).eq("status", "entwurf").is("gesendet_at", null)
      .select("id");
    if (uErr) throw uErr;
    console.log(`   ✅ ${f.firma}: ${data?.length ?? 0} Schritte freigegeben`);
  }

  // ── Senden ──
  const { budget, stufe } = tagesbudget();
  const fenster = imSendefenster();
  console.log(`\n   Tagesbudget: ${budget} (${stufe})`);
  console.log(`   Sendefenster: ${fenster.ok ? "offen" : `zu — ${fenster.grund}`}\n`);

  const r = await sendeFreigegebene();
  console.log(`   Gesendet: ${r.gesendet}`);
  if (Object.keys(r.proSchritt).length > 0) {
    console.log(`   Nach Schritt: ${Object.entries(r.proSchritt).map(([s, n]) => `Mail ${s}: ${n}`).join(", ")}`);
  }
  if (r.uebersprungen) console.log(`   Übersprungen: ${r.uebersprungen}`);
  if (r.hinweis) console.log(`   Hinweis: ${r.hinweis}`);
  for (const f of r.fehler) console.log(`   ⚠️  ${f}`);

  console.log("\n   Mail 2 und 3 sind terminiert. Sie gehen NUR raus, wenn der");
  console.log("   Versand-Cron auf Vercel läuft — dort müssen dieselben Variablen");
  console.log("   gesetzt sein (STELLENSIGNALE_VERSAND_ENABLED, SES_WARMUP_START).\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
