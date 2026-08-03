/**
 * Entwürfe für die anschreibbaren Betriebe erzeugen — mit und ohne
 * Stellensignal.
 *
 * Das ist der einzige Schritt, der Geld kostet: ein Claude-Aufruf je Betrieb
 * für alle drei Mails der Sequenz, rund 3 Cent. Deshalb gedeckelt und mit
 * Kostenanzeige vorab.
 *
 * VERSENDET NICHTS. Alle Entwürfe entstehen mit status='entwurf' und warten
 * auf die Freigabe im Dashboard.
 *
 * Aufruf:
 *   npx tsx scripts/entwuerfe-erzeugen.ts --dry    # zeigen, was käme
 *   npx tsx scripts/entwuerfe-erzeugen.ts 25       # für 25 Betriebe
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getFirmenFuerEntwurf, getFirmenOhneSignal, saveEntwurf } from "../lib/stellensignale/db";
import { erzeugeEntwurf } from "../lib/stellensignale/entwurf";
import type { FirmaOutreach } from "../types/stellensignale";

const dryRun = process.argv.includes("--dry");
const LIMIT = parseInt(process.argv.find((a) => /^\d+$/.test(a)) ?? "40", 10);

async function run() {
  console.log(`\n✍️  Entwürfe erzeugen${dryRun ? "  (DRY RUN)" : ""}\n${"═".repeat(64)}\n`);

  const mitSignal = await getFirmenFuerEntwurf(LIMIT);
  const rest = Math.max(0, LIMIT - mitSignal.length);
  const ohneSignal = rest > 0 ? await getFirmenOhneSignal(rest) : [];
  const alle = [...mitSignal, ...ohneSignal];

  console.log(`   mit Stellensignal:  ${mitSignal.length}  → Variante mit konkretem Anlass`);
  console.log(`   ohne Stellensignal: ${ohneSignal.length}  → Variante über die Branchenlage`);
  console.log(`   zusammen:           ${alle.length}`);
  console.log(`   geschätzte Kosten:  ca. ${(alle.length * 0.03).toFixed(2)} €\n`);

  if (alle.length === 0) { console.log("   Nichts zu tun.\n"); return; }

  if (dryRun) {
    for (const f of alle) {
      console.log(`   · ${f.firma.padEnd(40).slice(0, 40)} ${f.email}  ${f.stellentitel ? "[Stelle]" : "[ohne Stelle]"}`);
    }
    console.log("\n   DRY RUN — keine Entwürfe erzeugt, keine Kosten.\n");
    return;
  }

  let ok = 0;
  const fehler: string[] = [];

  for (const f of alle) {
    try {
      const seq = await erzeugeEntwurf(f);
      if (!seq) { fehler.push(`${f.firma}: kein valides JSON`); continue; }

      // Nur Schritt 1 ist sofort fällig. Die Termine für 2 und 3 setzt der
      // Versand, sobald die jeweilige Vormail tatsächlich raus ist.
      await saveEntwurf({ zielfirma_id: f.zielfirma_id, signal_id: f.signal_id || null, schritt: 1,
        betreff: seq.mail_1.betreff, text: seq.mail_1.text, faellig_am: new Date().toISOString() });
      await saveEntwurf({ zielfirma_id: f.zielfirma_id, signal_id: f.signal_id || null, schritt: 2,
        betreff: seq.mail_2.betreff, text: seq.mail_2.text, faellig_am: null });
      await saveEntwurf({ zielfirma_id: f.zielfirma_id, signal_id: f.signal_id || null, schritt: 3,
        betreff: seq.mail_3.betreff, text: seq.mail_3.text, faellig_am: null });

      ok++;
      console.log(`   ✅ ${f.firma.padEnd(40).slice(0, 40)} ${f.stellentitel ? "[Stelle]" : "[ohne Stelle]"}`);
    } catch (e) {
      fehler.push(`${f.firma}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${"═".repeat(64)}`);
  console.log(`   ${ok} Sequenzen erzeugt (je 3 Mails)`);
  for (const f of fehler.slice(0, 8)) console.log(`   ⚠️  ${f}`);
  console.log(`\n   Alle stehen auf 'entwurf' und warten auf Freigabe.`);
  console.log(`   Es wurde NICHTS versendet.\n`);
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
