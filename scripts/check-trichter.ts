/**
 * TRICHTER-AUSWERTUNG — reines Lesen.
 *
 * Zeigt, wie viele der erfassten Firmen tatsächlich anschreibbar sind und wo
 * unterwegs welche verloren gehen. Führt ausschließlich SELECT-Abfragen aus:
 * kein INSERT, kein UPDATE, kein DELETE.
 *
 * Aufruf: npx tsx scripts/check-trichter.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { erreichbarkeit, mindestScore } from "../lib/stellensignale/erreichbarkeit";
import { istFachkraft } from "../lib/stellensignale/qualify";
import type { FirmaOutreach, Zielfirma, StellenSignal, StellenEntwurf } from "../types/stellensignale";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

function zeile(label: string, n: number, von?: number) {
  const anteil = von && von > 0 ? `  (${Math.round((n / von) * 100)} %)` : "";
  console.log(`   ${String(n).padStart(5)}  ${label}${anteil}`);
}

async function run() {
  console.log("\n📊 TRICHTER — Stellensignal\n");

  const { data: fRaw } = await db.from("zielfirmen").select("*");
  const firmen = (fRaw ?? []) as Zielfirma[];
  const { data: sRaw } = await db.from("stellen_signale").select("*");
  const signale = (sRaw ?? []) as StellenSignal[];
  const { data: oRaw } = await db.from("v_firma_outreach").select("*");
  const outreach = (oRaw ?? []) as FirmaOutreach[];
  const { data: eRaw } = await db.from("stellen_entwuerfe").select("*");
  const entwuerfe = (eRaw ?? []) as StellenEntwurf[];

  // ── Firmen ──
  console.log("── Firmen ──");
  const aktiv = firmen.filter((f) => f.status === "aktiv");
  zeile("Zielfirmen gesamt", firmen.length);
  zeile("davon aktiv", aktiv.length, firmen.length);
  zeile("davon mit Website", aktiv.filter((f) => f.website).length, aktiv.length);
  zeile("davon mit E-Mail", aktiv.filter((f) => f.email).length, aktiv.length);

  const proStatus = new Map<string, number>();
  for (const f of firmen) proStatus.set(f.status, (proStatus.get(f.status) ?? 0) + 1);
  console.log(`          Status: ${[...proStatus].map(([k, v]) => `${k}=${v}`).join(", ")}`);

  const proQuelle = new Map<string, number>();
  for (const f of firmen) proQuelle.set(f.quelle ?? "—", (proQuelle.get(f.quelle ?? "—") ?? 0) + 1);
  console.log(`          Herkunft: ${[...proQuelle].map(([k, v]) => `${k}=${v}`).join(", ")}`);

  // ── Signale ──
  console.log("\n── Stellensignale ──");
  zeile("Signale gesamt", signale.length);
  zeile("davon als Fachkraft eingestuft", signale.filter((s) => s.ist_fachkraft).length, signale.length);
  const sQuelle = new Map<string, number>();
  for (const s of signale) sQuelle.set(s.quelle, (sQuelle.get(s.quelle) ?? 0) + 1);
  console.log(`          Quelle: ${[...sQuelle].map(([k, v]) => `${k}=${v}`).join(", ")}`);

  // Gegenprüfung: stimmt die gespeicherte Einstufung mit der aktuellen Logik?
  const abweichung = signale.filter(
    (s) => s.ist_fachkraft !== istFachkraft({ stellentitel: s.stellentitel, raw_text: s.raw_text }),
  );
  if (abweichung.length > 0) {
    console.log(`          ⚠️  ${abweichung.length} Signal(e) würden mit der heutigen Logik anders eingestuft`);
  }

  // ── Ansprechbar ──
  console.log("\n── Ansprechbar (eine Zeile je Firma, heißeste Stelle) ──");
  zeile("Firmen in v_firma_outreach", outreach.length);
  const mitFach = outreach.filter((f) => f.ist_fachkraft);
  zeile("mit Fachkraft-Signal", mitFach.length, outreach.length);
  const mitMail = mitFach.filter((f) => f.email);
  zeile("davon mit E-Mail  → anschreibbar", mitMail.length, mitFach.length);
  zeile("davon heiß (≥8 Wochen offen)", mitMail.filter((f) => f.ist_heiss).length, mitMail.length);

  // ── Erreichbarkeit ──
  const min = mindestScore();
  console.log(`\n── Erreichbarkeit (Mindestwert ${min}) ──`);
  const bewertet = mitMail.map((f) => ({ f, s: erreichbarkeit(f).score })).sort((a, b) => b.s - a.s);
  zeile(`erreicht den Mindestwert → geht in die Entwurfs-Warteschlange`, bewertet.filter((x) => x.s >= min).length, mitMail.length);
  zeile("darunter → wird übersprungen", bewertet.filter((x) => x.s < min).length, mitMail.length);

  if (bewertet.length > 0) {
    console.log("\n   Die besten Kandidaten:");
    for (const { f, s } of bewertet.slice(0, 8)) {
      console.log(`     ${String(s).padStart(2)} Punkte · ${f.firma} (${f.ort ?? "?"}) — ${f.stellentitel}`);
    }
  }

  // ── Entwürfe ──
  console.log("\n── Entwürfe ──");
  const eStatus = new Map<string, number>();
  for (const e of entwuerfe) eStatus.set(e.status, (eStatus.get(e.status) ?? 0) + 1);
  if (entwuerfe.length === 0) console.log("      keine");
  for (const [k, v] of eStatus) console.log(`   ${String(v).padStart(5)}  ${k}`);
  const gesendet = entwuerfe.filter((e) => e.gesendet_at);
  if (gesendet.length > 0) console.log(`   ${String(gesendet.length).padStart(5)}  bereits versendet`);

  // ── Fazit ──
  const bereit = bewertet.filter((x) => x.s >= min).length;
  const schonEntwurf = new Set(entwuerfe.map((e) => e.zielfirma_id));
  const offenNeu = bewertet.filter((x) => x.s >= min && !schonEntwurf.has(x.f.zielfirma_id)).length;
  console.log("\n── Fazit ──");
  console.log(`   ${bereit} Firmen erfüllen alle Kriterien für eine Ansprache.`);
  console.log(`   ${offenNeu} davon haben noch keinen Entwurf.`);
  console.log(`   Bei 5 Mails/Tag (Warmup-Woche 1) reicht das für ${Math.floor(offenNeu / 5)} Tag(e).\n`);
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
