/**
 * LIVE-DEMO der kompletten Kette an echten Betrieben — ohne Datenbank.
 *
 *   Arbeitsagentur  → Betriebe mit offener Fachkraft-Stelle
 *   Filter          → Personaldienstleister und Konzerne raus
 *   OpenStreetMap   → Website über Namensabgleich ergaenzen
 *   Impressum       → E-Mail und Geschaeftsfuehrung
 *   Claude          → die drei Mails der Sequenz
 *
 * Schreibt NICHTS: keine Zielfirma, kein Signal, kein Entwurf, kein Versand.
 *
 * Aufruf:
 *   npx tsx scripts/demo-echte-firmen.ts                 # Oldenburg, 10 Betriebe
 *   npx tsx scripts/demo-echte-firmen.ts Wilhelmshaven   # anderer Ort
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.STELLENSIGNALE_ARBEITSAGENTUR = "true";
process.env.STELLENSIGNALE_OSM = "true";

import { discoverArbeitsagentur } from "../lib/stellensignale/platforms/arbeitsagentur";
import { discoverOsm } from "../lib/stellensignale/platforms/osm";
import { istAusgeschlossen, istPdlWebsite } from "../lib/stellensignale/filter";
import { istFachkraft } from "../lib/stellensignale/qualify";
import { scrapeWebsiteForContact } from "../lib/website-scraper";
import { erzeugeEntwurf } from "../lib/stellensignale/entwurf";
import { erreichbarkeit } from "../lib/stellensignale/erreichbarkeit";
import type { FirmaOutreach } from "../types/stellensignale";

const ORT = process.argv[2] ?? "Oldenburg";
const GEWERKE = ["Elektroniker", "Anlagenmechaniker SHK", "Metallbauer", "Industriemechaniker"];

/** Firmennamen für den Abgleich vereinheitlichen: Rechtsform und Füllwörter weg. */
function normalisiere(n: string): string {
  return n.toLowerCase()
    .replace(/\b(gmbh|mbh|co|kg|ohg|ag|se|e\.?k\.?|gbr|&|und)\b/g, " ")
    .replace(/[^a-zäöüß0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  console.log(`\n🔎 Live-Demo · ${ORT}\n${"═".repeat(70)}\n`);

  // ── 1. Betriebe mit offener Fachkraft-Stelle ──
  const roh: Awaited<ReturnType<typeof discoverArbeitsagentur>> = [];
  for (const g of GEWERKE) {
    roh.push(...(await discoverArbeitsagentur(ORT, g)));
    await new Promise((r) => setTimeout(r, 300));
  }
  // Anzeigen je Arbeitgeber zaehlen. Das ist das robusteste Signal gegen
  // Personaldienstleister und Konzerne: Ein Handwerksbetrieb mit 20 Leuten
  // schaltet ein bis zwei Anzeigen, eine Zeitarbeitsfirma zehn und mehr —
  // quer ueber alle Gewerke. Namenslisten veralten, diese Zahl nicht.
  const anzahl = new Map<string, number>();
  for (const t of roh) anzahl.set(t.firma, (anzahl.get(t.firma) ?? 0) + 1);
  const MAX_ANZEIGEN = 3;

  const proFirma = new Map<string, (typeof roh)[number]>();
  const verworfen: string[] = [];
  for (const t of roh) {
    const grund = istAusgeschlossen(t.firma);
    if (grund) { if (!verworfen.some((v) => v.startsWith(t.firma))) verworfen.push(`${t.firma} — ${grund}`); continue; }
    const n = anzahl.get(t.firma) ?? 1;
    if (n > MAX_ANZEIGEN) {
      if (!verworfen.some((v) => v.startsWith(t.firma))) verworfen.push(`${t.firma} — ${n} Anzeigen gleichzeitig`);
      continue;
    }
    if (!istFachkraft({ stellentitel: t.stellentitel, raw_text: t.raw_text })) continue;
    if (!proFirma.has(t.firma)) proFirma.set(t.firma, t);
  }
  const firmen = [...proFirma.values()].slice(0, 10);

  console.log(`${roh.length} Anzeigen geladen → ${proFirma.size} Betriebe nach Filter`);
  console.log(`${verworfen.length} Arbeitgeber aussortiert, davon:`);
  for (const v of verworfen.slice(0, 8)) console.log(`   ⛔ ${v}`);
  console.log("");
  console.log("── 10 Betriebe mit offener Fachkraft-Stelle ──\n");
  firmen.forEach((f, i) => console.log(`${String(i + 1).padStart(2)}. ${f.firma}\n    ${f.stellentitel} · ${f.ort}`));

  // ── 2. Websites über OSM ergänzen ──
  console.log(`\n${"─".repeat(70)}\n🏭 Websites über OpenStreetMap zuordnen...\n`);
  const osm = await discoverOsm(ORT);
  const osmIndex = new Map<string, string>();
  for (const o of osm) if (o.website) osmIndex.set(normalisiere(o.firma), o.website);

  /**
   * Domain aus dem Firmennamen raten und verifizieren.
   *
   * OSM kennt laengst nicht jeden Betrieb. Die meisten deutschen Handwerks- und
   * Industriebetriebe haben aber eine Domain, die direkt aus dem Namen folgt.
   * Geraten wird nur, VERIFIZIERT wird ueber den Seiteninhalt: Nur wenn ein
   * markanter Namensbestandteil auf der Seite auftaucht, gilt der Treffer.
   * Sonst landet man bei einer fremden Firma mit aehnlichem Namen.
   */
  async function rateWebsite(name: string): Promise<string | null> {
    const woerter = normalisiere(name).split(" ").filter((w) => w.length > 2);
    if (woerter.length === 0) return null;
    const kandidaten = [
      woerter.join("-"),
      woerter.join(""),
      woerter.slice(0, 2).join("-"),
      woerter.slice(0, 2).join(""),
      woerter[0],
    ];
    const pruefwort = woerter.sort((a, b) => b.length - a.length)[0];

    const gesehen = new Set<string>();
    for (const k of kandidaten) {
      if (!k || k.length < 4 || gesehen.has(k)) continue;
      gesehen.add(k);
      const url = `https://www.${k}.de`;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal, redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimeSocialBot/1.0)" } });
        clearTimeout(timer);
        if (!res.ok) continue;
        const html = (await res.text()).toLowerCase();
        // Verifikation: markantestes Namenswort muss auf der Seite vorkommen.
        if (pruefwort.length > 3 && html.includes(pruefwort)) return url;
      } catch { /* Domain existiert nicht oder antwortet nicht */ }
    }
    return null;
  }

  const mitWebsite: { f: (typeof firmen)[number]; website: string; quelle: string }[] = [];
  for (const f of firmen) {
    const key = normalisiere(f.firma);
    let treffer = osmIndex.get(key) ?? null;
    let quelle = "OSM";
    if (!treffer) {
      for (const [k, w] of osmIndex) {
        if (k.length > 5 && (k.includes(key) || key.includes(k))) { treffer = w; break; }
      }
    }
    if (!treffer) { treffer = await rateWebsite(f.firma); quelle = "geraten+geprüft"; }
    if (treffer) {
      mitWebsite.push({ f, website: treffer, quelle });
      console.log(`   ✅ ${f.firma}\n      ${treffer}   [${quelle}]`);
    } else {
      console.log(`   —  ${f.firma}  (keine Website gefunden)`);
    }
  }
  console.log(`\n   ${mitWebsite.length} von ${firmen.length} Betrieben mit Website`);

  // ── Websites gegenpruefen ──
  // Erst hier laesst sich zuverlaessig sagen, ob ein Betrieb Personal
  // ueberlaesst — die Pflichtangabe nach AUeG steht auf der Seite, nicht im
  // Firmennamen.
  console.log(`\n${"─".repeat(70)}\n🔍 Websites gegenprüfen (Pflichtangaben nach AÜG)\n`);
  const sauber: typeof mitWebsite = [];
  for (const e of mitWebsite) {
    let text = "";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      for (const pfad of ["", "/impressum"]) {
        const r = await fetch(`${e.website}${pfad}`, { signal: ctrl.signal, redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimeSocialBot/1.0)" } });
        if (r.ok) text += (await r.text()).replace(/<[^>]+>/g, " ");
      }
      clearTimeout(timer);
    } catch { /* nicht erreichbar → im Zweifel behalten */ }

    const grund = istPdlWebsite(text);
    if (grund) console.log(`   ⛔ ${e.f.firma}\n      ${e.website} → ${grund}`);
    else { sauber.push(e); console.log(`   ✅ ${e.f.firma}\n      ${e.website}`); }
  }
  console.log(`\n   ${sauber.length} von ${mitWebsite.length} Betrieben bleiben übrig`);
  mitWebsite.length = 0;
  mitWebsite.push(...sauber);

  if (mitWebsite.length === 0) {
    console.log("\n   Kein Treffer für die Mail-Demo. Anderen Ort probieren.\n");
    return;
  }

  // ── 3. Impressum auswerten ──
  console.log(`\n${"─".repeat(70)}\n📇 Impressum des ersten Treffers auswerten...\n`);
  const { f, website } = mitWebsite[0];
  const kontakt = await scrapeWebsiteForContact(website);
  console.log(`   Firma:   ${f.firma}`);
  console.log(`   Website: ${website}`);
  console.log(`   E-Mail:  ${kontakt.bestEmail ?? "— nicht gefunden"}`);
  console.log(`   GF:      ${kontakt.gfName ?? "— nicht gefunden"}`);

  if (!kontakt.bestEmail) {
    console.log("\n   Ohne E-Mail keine Mail-Demo.\n");
    return;
  }

  // ── 4. Die drei Mails ──
  const firma: FirmaOutreach = {
    zielfirma_id: "demo", firma: f.firma, gewerk: f.gewerk, ort: f.ort, plz: f.plz,
    website, email: kontakt.bestEmail, email_quelle: "impressum", email_confidence: 90,
    gf_name: kontakt.gfName, firma_status: "aktiv", signal_id: "demo",
    stellentitel: f.stellentitel, quelle: "arbeitsagentur", quelle_url: f.quelle_url,
    raw_text: null, erstfund: "2026-06-01", letzter_fund: "2026-08-03",
    ist_fachkraft: true, wochen_offen: 9, ist_heiss: true, anzahl_signale: 1,
  };

  const bewertung = erreichbarkeit(firma);
  console.log(`\n   Erreichbarkeit: ${bewertung.score} Punkte`);
  for (const g of bewertung.gruende) console.log(`     · ${g}`);

  console.log(`\n${"─".repeat(70)}\n✉️  Die drei Mails der Sequenz\n`);
  const seq = await erzeugeEntwurf(firma);
  if (!seq) { console.log("   Claude lieferte kein valides JSON.\n"); return; }

  const mails = [
    { nr: 1, wann: "sofort",              m: seq.mail_1 },
    { nr: 2, wann: "4 Tage später",       m: seq.mail_2 },
    { nr: 3, wann: "3 Tage nach Mail 2",  m: seq.mail_3 },
  ];
  for (const { nr, wann, m } of mails) {
    const w = m.text.trim().split(/\s+/).length;
    console.log(`${"═".repeat(70)}\nMAIL ${nr} · ${wann} · ${w} Wörter`);
    console.log(`Betreff: ${m.betreff}\n`);
    console.log(m.text);
    console.log("");
  }
  console.log("═".repeat(70));
  console.log("Nichts gespeichert, nichts versendet.\n");
}

run().catch((e) => { console.error("\n❌", e); process.exit(1); });
