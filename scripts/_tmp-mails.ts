/** Adressen aus Impressen nachziehen. Kostet nichts, nur HTTP. */
import { config } from "dotenv"; config({ path: ".env.local" });
import { runEmailEnrichment } from "../lib/stellensignale/email-finder";
import { getClient } from "../lib/supabase";
async function main(){
  const db=getClient();
  const vor=await db.from("zielfirmen").select("id",{count:"exact",head:true}).eq("status","aktiv").not("email","is",null);
  console.log(`   vorher: ${vor.count} Firmen mit Adresse`);
  for (let runde=1; runde<=8; runde++){
    const e = await runEmailEnrichment() as {gefunden?:number;geprueft?:number};
    const jetzt=await db.from("zielfirmen").select("id",{count:"exact",head:true}).eq("status","aktiv").not("email","is",null);
    console.log(`   Runde ${runde}: +${e.gefunden ?? 0} von ${e.geprueft ?? 0} geprueft → gesamt ${jetzt.count}`);
    if ((e.geprueft ?? 0) === 0) { console.log("   nichts mehr zu pruefen"); break; }
  }
}
main().catch(e=>{console.error("FEHLER:", e instanceof Error ? e.message : e);process.exit(1);});
