// ─────────────────────────────────────────────────────────────────
// PER-FIRMA-KARRIERE-CRAWL (Ergänzung zum Discovery-Motor).
//
// Discovery (discover.ts) findet NEUE Firmen über die Plattformen. Dieser
// Crawl vertieft BEKANNTE Firmen: er prüft für jede aktive Firma zusätzlich
// deren eigene Karriereseite — dort stehen Stellen, die auf Plattformen evtl.
// gar nicht inseriert sind, und die karriere_url wird dabei ermittelt.
//
// Seit Phase 1b macht crawl-karriere echte HTTP-Abrufe (kein API-Key, keine
// Kosten). Deshalb ist dieser Lauf gedeckelt und arbeitet mit begrenzter
// Parallelität — ohne das läuft der Cron in die Vercel-Zeitgrenze, sobald mehr
// als eine Handvoll Firmen in der Datenbank stehen.
// ─────────────────────────────────────────────────────────────────
import { getAktiveZielfirmen, getBlacklist, upsertSignal, setKarriereUrl } from "@/lib/stellensignale/db";
import { crawlKarriereseite } from "@/lib/stellensignale/crawl-karriere";
import { pruefeAnzeige } from "@/lib/stellensignale/filter";
import { istFachkraft } from "@/lib/stellensignale/qualify";
import type { Zielfirma } from "@/types/stellensignale";

export interface KarriereCrawlResult {
  firmenBearbeitet: number;
  anzeigenGefunden: number;
  anzeigenVerworfen: number;
  signaleUpserted: number;
  fehler: { firma: string; error: string }[];
}

async function verarbeiteFirma(
  firma: Zielfirma,
  opts: { blacklist: string[]; heute: string }
): Promise<{ gefunden: number; verworfen: number; upserted: number }> {
  const karriere = await crawlKarriereseite(firma);
  if (karriere.ermittelteKarriereUrl && !firma.karriere_url) {
    await setKarriereUrl(firma.id, karriere.ermittelteKarriereUrl);
  }

  let verworfen = 0;
  let upserted = 0;
  for (const anzeige of karriere.anzeigen) {
    const ergebnis = pruefeAnzeige(anzeige, { firmaWebsite: firma.website, blacklist: opts.blacklist });
    if (!ergebnis.akzeptiert) {
      verworfen++;
      continue;
    }
    await upsertSignal({
      zielfirma_id: firma.id,
      stellentitel: anzeige.stellentitel,
      quelle: anzeige.quelle,
      quelle_url: anzeige.quelle_url,
      ist_fachkraft: istFachkraft(anzeige),
      raw_text: anzeige.raw_text,
      heute: opts.heute,
    });
    upserted++;
  }
  return { gefunden: karriere.anzeigen.length, verworfen, upserted };
}

export async function runKarriereCrawl(opts: {
  heute: string;
  /** Firmen je Lauf. Default aus STELLENSIGNALE_KARRIERE_LIMIT, sonst 25. */
  limit?: number;
  /** Zeitbudget in ms. Der Lauf bricht sauber ab, statt ins Timeout zu rennen. */
  deadlineMs?: number;
}): Promise<KarriereCrawlResult & { abgebrochen: boolean }> {
  const result: KarriereCrawlResult & { abgebrochen: boolean } = {
    firmenBearbeitet: 0,
    anzeigenGefunden: 0,
    anzeigenVerworfen: 0,
    signaleUpserted: 0,
    fehler: [],
    abgebrochen: false,
  };

  const limit = opts.limit ?? parseInt(process.env.STELLENSIGNALE_KARRIERE_LIMIT ?? "25", 10);
  // Vercel bricht bei maxDuration=300 hart ab. Wir hören vorher von selbst auf,
  // damit die bis dahin gefundenen Signale gespeichert bleiben und der Cron ein
  // verwertbares Ergebnis zurückgibt.
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);

  // getAktiveZielfirmen sortiert nach updated_at aufsteigend — die am längsten
  // nicht angefassten Firmen kommen zuerst. Über mehrere Läufe rotiert der
  // Crawl damit von selbst durch den gesamten Bestand.
  const firmen = await getAktiveZielfirmen(limit);
  const blacklist = await getBlacklist();

  // Begrenzte Parallelität: schnell genug, ohne fremde Server zu belasten.
  const PARALLEL = 4;
  let index = 0;

  async function arbeiter(): Promise<void> {
    while (true) {
      if (Date.now() > deadline) { result.abgebrochen = true; return; }
      const i = index++;
      if (i >= firmen.length) return;
      const firma = firmen[i];
      try {
        const r = await verarbeiteFirma(firma, { blacklist, heute: opts.heute });
        result.firmenBearbeitet++;
        result.anzeigenGefunden += r.gefunden;
        result.anzeigenVerworfen += r.verworfen;
        result.signaleUpserted += r.upserted;
      } catch (e) {
        result.fehler.push({ firma: firma.firma, error: String(e instanceof Error ? e.message : e) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARALLEL, firmen.length) }, arbeiter));
  return result;
}
