// ─────────────────────────────────────────────────────────────────
// MAPS-FIRMENSUCHE — legt Zielfirmen an, unabhängig von Stellenanzeigen.
//
// Zweck: starke regionale Mittelständler finden, die in keiner Lead-Liste
// stehen und gerade vielleicht gar nicht inserieren. Da Maps fast immer die
// Website liefert, greift danach die (kostenlose) Impressum-Mail-Findung.
//
// Es werden KEINE Stellen-Signale erzeugt — nur Firmen. Ob sie suchen,
// klärt anschließend der Karriere-Crawl bzw. die Plattform-Discovery.
// ─────────────────────────────────────────────────────────────────
import { getZielfirmen, createZielfirma, updateZielfirma } from "@/lib/stellensignale/db";
import { domainOf, istAusgeschlossen } from "@/lib/stellensignale/filter";
import { discoverMaps, mapsAktiv } from "@/lib/stellensignale/platforms/maps";
import type { DiscoveryZiel, ZielfirmaStatus } from "@/types/stellensignale";

export interface MapsResult {
  aktiv: boolean;
  queriesAusgefuehrt: number;
  trefferGesamt: number;
  verworfen: number;
  neueFirmen: number;
  websitesNachgetragen: number;
  proben: string[];
  fehler: string[];
}

function dedupKey(f: { website?: string | null; firma: string; ort?: string | null }): string {
  const dom = domainOf(f.website);
  if (dom) return `dom:${dom}`;
  return `no:${f.firma.trim().toLowerCase()}|${(f.ort ?? "").trim().toLowerCase()}`;
}

export async function runMapsDiscovery(opts: {
  ziele: DiscoveryZiel[];
  maxQueries?: number;
}): Promise<MapsResult> {
  const result: MapsResult = {
    aktiv: mapsAktiv(),
    queriesAusgefuehrt: 0,
    trefferGesamt: 0,
    verworfen: 0,
    neueFirmen: 0,
    websitesNachgetragen: 0,
    proben: [],
    fehler: [],
  };
  if (!result.aktiv) {
    result.fehler.push("STELLENSIGNALE_MAPS ist nicht auf true gesetzt.");
    return result;
  }

  const maxQueries = opts.maxQueries ?? parseInt(process.env.STELLENSIGNALE_MAPS_MAX_QUERIES ?? "3", 10);

  const bestand = await getZielfirmen();
  const firmaByKey = new Map<string, { id: string; website: string | null }>();
  for (const f of bestand) firmaByKey.set(dedupKey(f), { id: f.id, website: f.website });

  for (const ziel of opts.ziele) {
    for (const begriff of ziel.gewerke) {
      if (result.queriesAusgefuehrt >= maxQueries) {
        result.fehler.push(`Deckel erreicht (${maxQueries} Suchen) — Rest übersprungen.`);
        return result;
      }
      result.queriesAusgefuehrt++;

      let treffer;
      try {
        treffer = await discoverMaps(ziel.ort, begriff);
      } catch (e) {
        result.fehler.push(`${ziel.ort}/${begriff}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      result.trefferGesamt += treffer.length;

      for (const t of treffer) {
        // Konzerne/Personaldienstleister raus.
        if (istAusgeschlossen(t.firma)) {
          result.verworfen++;
          continue;
        }
        const key = dedupKey({ website: t.website, firma: t.firma, ort: t.ort });
        const vorhanden = firmaByKey.get(key);

        if (vorhanden) {
          // Firma kennen wir schon: höchstens die Website nachtragen.
          if (t.website && !vorhanden.website) {
            try {
              await updateZielfirma(vorhanden.id, { website: t.website });
              vorhanden.website = t.website;
              result.websitesNachgetragen++;
            } catch { /* nicht kritisch */ }
          }
          continue;
        }

        try {
          await createZielfirma({
            firma: t.firma,
            website: t.website,
            karriere_url: null,
            gewerk: begriff,
            ort: t.ort ?? ziel.ort,
            plz: t.plz ?? ziel.plz,
            mitarbeiter_geschaetzt: null,
            gf_name: null,
            email: null,
            email_quelle: null,
            email_confidence: null,
            status: "aktiv" as ZielfirmaStatus,
            cooldown_bis: null,
            quelle: "maps",
          });
          firmaByKey.set(key, { id: "neu", website: t.website });
          result.neueFirmen++;
          if (result.proben.length < 20) {
            result.proben.push(`${t.firma}${t.website ? ` (${domainOf(t.website)})` : " (keine Website)"}`);
          }
        } catch (e) {
          result.fehler.push(`anlegen ${t.firma}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }
  return result;
}
