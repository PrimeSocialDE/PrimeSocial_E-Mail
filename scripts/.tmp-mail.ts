import { config } from "dotenv"; config({ path: ".env.local" });
import { runEmailEnrichment } from "../lib/stellensignale/email-finder";
import { getFirmenFuerEntwurf, getZielfirmen } from "../lib/stellensignale/db";
async function run(){
  for (let i=1;i<=4;i++){
    const r = await runEmailEnrichment({ limit: 120 }) as {kandidaten?:number;geprueft?:number;gefunden?:number};
    console.log(`  Durchgang ${i}: ${r.gefunden}/${r.geprueft} gefunden (${r.kandidaten} Kandidaten offen)`);
  }
  const a=(await getZielfirmen()).filter(f=>f.status==="aktiv");
  console.log(`\n  mit E-Mail: ${a.filter(f=>f.email).length} von ${a.length} aktiven`);
  console.log(`  ANSCHREIBBAR: ${(await getFirmenFuerEntwurf(1000)).length}\n`);
}
run();
