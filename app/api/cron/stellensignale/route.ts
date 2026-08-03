import { NextRequest, NextResponse } from "next/server";
import zieleData from "@/data/stellensignale-targets.json";
import { runDiscovery } from "@/lib/stellensignale/discover";
import { runKarriereCrawl } from "@/lib/stellensignale/pipeline";
import { runEmailEnrichment } from "@/lib/stellensignale/email-finder";
import { runWebsiteEnrichment } from "@/lib/stellensignale/website-enrichment";
import type { DiscoveryZiel } from "@/types/stellensignale";

// Crawl-Cron für das STELLENSIGNAL-Modul (alle 3 Tage).
//
// Ablauf:
//   1. DISCOVERY: Arbeitsagentur-API nach Ort×Gewerk → neue Firmen + Signale
//   2. KARRIERE-CRAWL: bekannte Firmen auf ihrer eigenen Karriereseite
//   3. WEBSITE-ANREICHERUNG: Firmen ohne Website → Domain aus dem Namen
//      ermitteln. Ohne diesen Schritt liefert die Arbeitsagentur zwar Namen,
//      aber keine Adressen — und ohne Adresse entsteht kein Entwurf.
//   4. EMAIL-ANREICHERUNG: Firmen ohne Mail → Impressum/Pattern (gratis)
//
// ZEITBUDGET — der Grund, warum das hier nicht einfach drei await hintereinander
// sind: Seit Phase 1b machen alle drei Phasen echte HTTP-Abrufe. Ohne Deckel
// frisst Phase 1 die gesamte Laufzeit, Vercel bricht bei maxDuration hart ab,
// und Phase 2 und 3 laufen NIE — dauerhaft, ohne dass es auffällt, weil der
// Cron ja "nur" ein Timeout meldet. Jede Phase bekommt daher ihren eigenen
// Anteil und hört von selbst auf.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const ZIELE: DiscoveryZiel[] = (zieleData as { ziele?: DiscoveryZiel[] }).ziele ?? [];

// Gesamtbudget bewusst unter maxDuration: lieber sauber aufhören und das
// Ergebnis zurückgeben, als von der Plattform abgeschnitten zu werden.
const GESAMT_MS = 250_000;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Kill-Switch — default AUS.
  if (process.env.STELLENSIGNALE_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "STELLENSIGNALE_ENABLED nicht gesetzt" });
  }

  const start = Date.now();
  const restMs = () => GESAMT_MS - (Date.now() - start);
  const heute = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const bericht: Record<string, unknown> = { ok: true, phasen: [] as string[] };
  const phasen = bericht.phasen as string[];

  try {
    // ── 1. Discovery (Arbeitsagentur) ──
    if (restMs() > 60_000) {
      bericht.discovery = await runDiscovery({ ziele: ZIELE, heute });
      phasen.push("discovery");
    } else {
      phasen.push("discovery übersprungen (Zeit)");
    }

    // ── 2. Karriere-Crawl ── bekommt, was übrig ist, minus Reserve für Phase 3
    if (restMs() > 60_000) {
      bericht.karriere = await runKarriereCrawl({
        heute,
        deadlineMs: Math.max(30_000, restMs() - 45_000),
      });
      phasen.push("karriere");
    } else {
      phasen.push("karriere übersprungen (Zeit)");
    }

    // ── 3. Website-Anreicherung ── Voraussetzung für Phase 4
    if (restMs() > 40_000) {
      bericht.websites = await runWebsiteEnrichment({
        deadlineMs: Math.max(20_000, restMs() - 25_000),
      });
      phasen.push("websites");
    } else {
      phasen.push("websites übersprungen (Zeit)");
    }

    // ── 4. E-Mail-Anreicherung ── günstig und schnell, läuft zuletzt
    if (restMs() > 15_000) {
      bericht.emails = await runEmailEnrichment();
      phasen.push("emails");
    } else {
      phasen.push("emails übersprungen (Zeit)");
    }

    bericht.laufzeitSekunden = Math.round((Date.now() - start) / 1000);
    return NextResponse.json(bericht);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stellensignale-cron] Abbruch:", msg);
    return NextResponse.json(
      { ok: false, error: msg, phasen, laufzeitSekunden: Math.round((Date.now() - start) / 1000) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
