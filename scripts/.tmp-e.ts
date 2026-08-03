import { config } from "dotenv"; config({ path: ".env.local" });
import { runEmailEnrichment } from "../lib/stellensignale/email-finder";
async function run(){
  const r = await runEmailEnrichment({ limit: 60 }) as {kandidaten?:number;geprueft?:number;gefunden?:number;proben?:{firma:string;ergebnis:string}[]};
  console.log(`\n  ${r.gefunden} von ${r.geprueft} geprüft (${r.kandidaten} relevante Kandidaten offen)`);
  for(const p of (r.proben??[]).filter(x=>!x.ergebnis.startsWith("keine")).slice(0,12)) console.log(`   ✅ ${p.firma}: ${p.ergebnis}`);
  console.log("");
}
run();
