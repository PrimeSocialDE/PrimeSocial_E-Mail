// ─────────────────────────────────────────────────────────────────
// DISCOVERY — der Motor des Stellensignal-Moduls.
// Scraped die Plattformen (Kleinanzeigen, Arbeitsagentur, Indeed) nach
// Ort × Gewerk, legt gefundene Firmen AUTOMATISCH an (mit Dedup) und
// speichert je Anzeige ein Signal. So wächst die zielfirmen-Tabelle von
// selbst — CSV-Import ist nur noch Ergänzung.
//
// ⚠️ PHASE-1-GERÜST: Die Plattform-Adapter liefern aktuell leere Listen
// (kein API-Key/Verbrauch). Die Verdrahtung ist vollständig — sobald die
// Adapter in Phase 1b echte Daten liefern, läuft alles ohne Änderung durch.
// ─────────────────────────────────────────────────────────────────
import { getZielfirmen, getBlacklist, createZielfirma, upsertSignal, updateZielfirma } from "@/lib/stellensignale/db";
import { pruefeAnzeige, domainOf, istAusgeschlossen } from "@/lib/stellensignale/filter";
import { istFachkraft } from "@/lib/stellensignale/qualify";
import { discoverKleinanzeigen } from "@/lib/stellensignale/platforms/kleinanzeigen";
import { discoverArbeitsagentur } from "@/lib/stellensignale/platforms/arbeitsagentur";
import { discoverIndeed } from "@/lib/stellensignale/platforms/indeed";
import type { DiscoveryTreffer, DiscoveryZiel, ZielfirmaStatus } from "@/types/stellensignale";

export interface DiscoveryResult {
  trefferGesamt: number;
  verworfen: number;
  neueFirmen: number;
  signaleUpserted: number;
  queriesAusgefuehrt: number;
  abgeschnitten: boolean; // true, wenn wegen Run-Deckel nicht alle Ziele liefen
  fehler: string[];
}

// Dedup-Schlüssel: Website-Domain, sonst firma|ort (klein). Gleiche Logik wie
// der CSV-Import — so kollidieren Discovery und CSV nicht miteinander.
function dedupKey(f: { website?: string | null; firma: string; ort?: string | null }): string {
  const dom = domainOf(f.website);
  if (dom) return `dom:${dom}`;
  return `no:${f.firma.trim().toLowerCase()}|${(f.ort ?? "").trim().toLowerCase()}`;
}

// Alle aktivierten Plattformen für ein (Ort, Gewerk) abfragen.
async function scrapeAllePlattformen(ort: string, gewerk: string): Promise<DiscoveryTreffer[]> {
  const treffer: DiscoveryTreffer[] = [];
  treffer.push(...(await discoverKleinanzeigen(ort, gewerk)));
  treffer.push(...(await discoverArbeitsagentur(ort, gewerk)));
  treffer.push(...(await discoverIndeed(ort, gewerk))); // intern per Flag gated
  return treffer;
}

export async function runDiscovery(opts: {
  ziele: DiscoveryZiel[];
  heute: string; // ISO-Date, vom Cron gesetzt
  maxQueries?: number; // optionaler Override (z.B. sehr klein für den Test-Button)
}): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    trefferGesamt: 0,
    verworfen: 0,
    neueFirmen: 0,
    signaleUpserted: 0,
    queriesAusgefuehrt: 0,
    abgeschnitten: false,
    fehler: [],
  };

  // Run-Deckel: max. Anzahl Ort×Gewerk-Queries pro Lauf (Kostenkontrolle).
  // Override (Test-Button) gewinnt, sonst Env, sonst 20.
  const maxQueries = opts.maxQueries ?? parseInt(process.env.STELLENSIGNALE_MAX_QUERIES ?? "20", 10);

  // Bestehende Firmen einmalig laden → In-Memory-Dedup (kein Select je Anzeige).
  // Website mitführen, um sie bei bekannten Firmen nachzutragen (Backfill).
  const bestand = await getZielfirmen();
  const firmaByKey = new Map<
    string,
    { id: string; website: string | null; email: string | null; mitarbeiter: number | null }
  >();
  for (const f of bestand)
    firmaByKey.set(dedupKey(f), {
      id: f.id,
      website: f.website,
      email: f.email,
      mitarbeiter: f.mitarbeiter_geschaetzt,
    });

  const blacklist = await getBlacklist();

  for (const ziel of opts.ziele) {
    for (const gewerk of ziel.gewerke) {
      // Harter Run-Deckel — lieber Rest morgen als eine explodierende Rechnung.
      if (result.queriesAusgefuehrt >= maxQueries) {
        result.abgeschnitten = true;
        result.fehler.push(`Run-Deckel erreicht (${maxQueries} Queries) — restliche Ziele übersprungen.`);
        return result;
      }
      result.queriesAusgefuehrt++;

      let treffer: DiscoveryTreffer[];
      try {
        treffer = await scrapeAllePlattformen(ziel.ort, gewerk);
      } catch (e) {
        result.fehler.push(`${ziel.ort}/${gewerk}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      result.trefferGesamt += treffer.length;

      // Anzeigen je Arbeitgeber zaehlen — das robusteste Signal gegen
      // Personaldienstleister und Konzerne. Ein Handwerksbetrieb mit 20 Leuten
      // schaltet ein bis zwei Anzeigen, eine Zeitarbeitsfirma zehn und mehr.
      // Namensmuster lassen sich umgehen ("TECH-PLUS", "nEw siMple woRk"),
      // diese Zahl nicht. An echten Daten fielen damit 41 von 91 Arbeitgebern
      // heraus, fast ausschliesslich zu Recht.
      const maxAnzeigen = parseInt(process.env.STELLENSIGNALE_MAX_ANZEIGEN_PRO_FIRMA ?? "3", 10);
      const anzeigenProFirma = new Map<string, number>();
      for (const t of treffer) anzeigenProFirma.set(t.firma, (anzeigenProFirma.get(t.firma) ?? 0) + 1);

      for (const t of treffer) {
        const anzahl = anzeigenProFirma.get(t.firma) ?? 1;
        if (anzahl > maxAnzeigen) {
          result.verworfen++;
          continue;
        }
        // 1) HARTER Störer-Filter (Blacklist/Keywords/Domain) VOR allem.
        const ergebnis = pruefeAnzeige(
          {
            stellentitel: t.stellentitel,
            quelle: t.quelle,
            quelle_url: t.quelle_url,
            raw_text: t.raw_text,
            inserent: t.inserent,
            bewerbung_email: t.bewerbung_email,
          },
          { firmaWebsite: t.website, blacklist }
        );
        if (!ergebnis.akzeptiert) {
          result.verworfen++;
          continue;
        }

        // 1b) Konzern-/Ausschluss-Filter: Großkonzerne & Personaldienstleister raus.
        if (istAusgeschlossen(t.firma)) {
          result.verworfen++;
          continue;
        }

        // 2) Firma finden oder automatisch anlegen (Dedup).
        const key = dedupKey({ website: t.website, firma: t.firma, ort: t.ort ?? ziel.ort });
        const vorhanden = firmaByKey.get(key);
        let firmaId = vorhanden?.id;
        if (!firmaId) {
          try {
            const neu = await createZielfirma({
              firma: t.firma,
              website: t.website,
              karriere_url: null,
              gewerk: t.gewerk ?? gewerk,
              ort: t.ort ?? ziel.ort,
              plz: t.plz ?? ziel.plz,
              mitarbeiter_geschaetzt: t.mitarbeiter,
              gf_name: null,
              // Bewerbungs-Mail aus der Anzeige direkt als Kontakt nutzen (gratis).
              email: t.bewerbung_email,
              email_quelle: t.bewerbung_email ? "anzeige" : null,
              email_confidence: t.bewerbung_email ? 65 : null,
              status: "aktiv" as ZielfirmaStatus,
              cooldown_bis: null,
              quelle: `discovery:${t.quelle}`,
            });
            firmaId = neu.id;
            firmaByKey.set(key, {
              id: firmaId,
              website: t.website,
              email: t.bewerbung_email,
              mitarbeiter: t.mitarbeiter,
            });
            result.neueFirmen++;
          } catch (e) {
            result.fehler.push(`anlegen ${t.firma}: ${e instanceof Error ? e.message : e}`);
            continue;
          }
        } else {
          // Backfill für bekannte Firma: Website und/oder Bewerbungs-Mail nachtragen,
          // falls bisher leer — damit E-Mail-Findung/Entwurf greifen können.
          const updates: Record<string, unknown> = {};
          if (t.website && !vorhanden!.website) updates.website = t.website;
          if (t.bewerbung_email && !vorhanden!.email) {
            updates.email = t.bewerbung_email;
            updates.email_quelle = "anzeige";
            updates.email_confidence = 65;
          }
          if (t.mitarbeiter && !vorhanden!.mitarbeiter) updates.mitarbeiter_geschaetzt = t.mitarbeiter;
          if (Object.keys(updates).length > 0) {
            try {
              await updateZielfirma(firmaId, updates);
              Object.assign(vorhanden!, updates);
            } catch { /* nicht kritisch */ }
          }
        }

        // 3) Signal upserten (dedupe auf firma+titel+quelle, nur letzter_fund updaten).
        try {
          await upsertSignal({
            zielfirma_id: firmaId,
            stellentitel: t.stellentitel,
            quelle: t.quelle,
            quelle_url: t.quelle_url,
            ist_fachkraft: istFachkraft(t),
            raw_text: t.raw_text,
            heute: opts.heute,
          });
          result.signaleUpserted++;
        } catch (e) {
          result.fehler.push(`signal ${t.firma}/${t.stellentitel}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  return result;
}
