import { config } from "dotenv"; config({ path: ".env.local" });
import { getClient } from "../lib/supabase";
async function main() {
  const db = getClient();
  const g = await db.from("stellen_entwuerfe").select("gesendet_an").not("gesendet_at","is",null);
  const er = await db.from("stellen_ereignisse").select("art");
  const arten = (er.data ?? []).map(e => e.art);
  const f = await db.from("stellen_entwuerfe").select("fehler,versuche").not("fehler","is",null).order("updated_at",{ascending:false}).limit(2);
  const teile = [`gesendet=${g.data?.length ?? 0}`, `ereignisse=[${arten.join(",") || "-"}]`];
  if (arten.includes("zugestellt")) teile.push("ZUSTELLUNG BESTAETIGT");
  for (const e of f.data ?? []) teile.push(`FEHLER(${e.versuche}): ${String(e.fehler).slice(0,80)}`);
  console.log(teile.join(" | "));
}
main().catch((e)=>console.log("PRUEFUNG FEHLGESCHLAGEN:", String(e).slice(0,100)));
