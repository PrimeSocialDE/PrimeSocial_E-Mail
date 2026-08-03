// ─────────────────────────────────────────────────────────────────
// OSM-FIRMENSUCHE — legt Zielfirmen an, unabhängig von Stellenanzeigen.
//
// Gegenstück zu discover-maps.ts, aber ohne Apify und ohne Kosten. Findet
// Produktionsbetriebe und Werke, die über Gewerke-Suchbegriffe nie auftauchen,
// und liefert in etwa der Hälfte der Fälle direkt die Website mit — womit die
// (kostenlose) Impressum-Mail-Findung greifen kann.
//
// Erzeugt KEINE Stellensignale, nur Firmen.
// ─────────────────────────────────────────────────────────────────
import { getZielfirmen, createZielfirma, updateZielfirma } from "@/lib/stellensignale/db";
import { domainOf, istAusgeschlossen } from "@/lib/stellensignale/filter";
import { discoverOsm, osmAktiv } from "@/lib/stellensignale/platforms/osm";
import type { ZielfirmaStatus } from "@/types/stellensignale";

export interface OsmResult {
  aktiv: boolean;
  orteAbgefragt: number;
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
  // Namen normalisieren, sonst gelten "Siemens" und "Siemens GmbH" als
  // verschiedene Firmen. An echten Daten standen neun Firmen doppelt drin.
  // Ort NICHT mehr im Schluessel: dieselbe Firma taucht je nach Anzeige mal
  // mit Sitz, mal mit Einsatzort auf — und wurde dadurch doppelt angelegt.
  const name = f.firma
    .toLowerCase()
    .replace(/\b(gmbh|mbh|co|kg|ohg|ag|se|e\.?\s?k\.?|gbr|und|&|inh\.?|niederlassung|filiale)\b/g, " ")
    .replace(/[^a-z\u00e4\u00f6\u00fc\u00df0-9]+/g, " ")
    .trim();
  return `no:${name}`;
}

/**
 * OSM-Kategorie grob auf ein Gewerk abbilden. Bewusst grob: die Zuordnung dient
 * nur der Vorsortierung im Dashboard, entscheidend ist später ohnehin die
 * konkrete Stellenanzeige.
 */
function gewerkVon(kategorie: string | null): string | null {
  if (!kategorie) return null;
  const k = kategorie.toLowerCase();
  if (/electric|elektro/.test(k)) return "elektro";
  if (/plumber|hvac|heating|sanitary/.test(k)) return "shk";
  if (/metal|blacksmith|welder|machine|steel|foundry/.test(k)) return "metall";
  if (/carpenter|joiner|roofer|builder|mason|scaffold|window/.test(k)) return "bau";
  if (/gardener|landscape/.test(k)) return "galabau";
  if (/works|industrial|product:/.test(k)) return "industrie";
  return null;
}

export async function runOsmDiscovery(opts: {
  orte: string[];
  radiusM?: number;
  maxOrte?: number;
}): Promise<OsmResult> {
  const result: OsmResult = {
    aktiv: osmAktiv(),
    orteAbgefragt: 0,
    trefferGesamt: 0,
    verworfen: 0,
    neueFirmen: 0,
    websitesNachgetragen: 0,
    proben: [],
    fehler: [],
  };
  if (!result.aktiv) {
    result.fehler.push("STELLENSIGNALE_OSM ist nicht auf true gesetzt.");
    return result;
  }

  const maxOrte = opts.maxOrte ?? parseInt(process.env.STELLENSIGNALE_OSM_MAX_ORTE ?? "3", 10);

  const bestand = await getZielfirmen();
  const firmaByKey = new Map<string, { id: string; website: string | null }>();
  for (const f of bestand) firmaByKey.set(dedupKey(f), { id: f.id, website: f.website });

  for (const ort of opts.orte) {
    if (result.orteAbgefragt >= maxOrte) {
      result.fehler.push(`Deckel erreicht (${maxOrte} Orte) — Rest übersprungen.`);
      break;
    }
    result.orteAbgefragt++;

    let treffer;
    try {
      treffer = await discoverOsm(ort, opts.radiusM);
    } catch (e) {
      result.fehler.push(`${ort}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    result.trefferGesamt += treffer.length;

    for (const t of treffer) {
      if (istAusgeschlossen(t.firma)) {
        result.verworfen++;
        continue;
      }
      const key = dedupKey({ website: t.website, firma: t.firma, ort: t.ort });
      const vorhanden = firmaByKey.get(key);

      if (vorhanden) {
        // Firma bekannt: höchstens die Website nachtragen, nie überschreiben.
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
          gewerk: gewerkVon(t.kategorie),
          ort: t.ort ?? ort,
          plz: t.plz,
          mitarbeiter_geschaetzt: null,
          gf_name: null,
          email: null,
          email_quelle: null,
          email_confidence: null,
          status: "aktiv" as ZielfirmaStatus,
          cooldown_bis: null,
          quelle: "osm",
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

    // Overpass ist ein Freiwilligendienst — zwischen Abfragen kurz warten.
    await new Promise((r) => setTimeout(r, 2000));
  }

  return result;
}
