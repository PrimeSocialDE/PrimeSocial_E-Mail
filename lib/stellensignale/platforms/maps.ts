// ─────────────────────────────────────────────────────────────────
// FIRMENSUCHE über GOOGLE MAPS.
//
// Findet regionale Betriebe unabhängig davon, ob sie gerade eine Stelle
// ausschreiben — also genau die "starken Mittelständler", die in keiner
// Lead-Liste stehen. Liefert vor allem die WEBSITE, womit die Impressum-
// Mail-Findung zuverlässig greift (anders als bei Indeed).
//
// Nutzt denselben Actor wie das bestehende Recherche-Modul.
// Doppelt gesichert: STELLENSIGNALE_MAPS=true UND ein Actor gesetzt.
// ─────────────────────────────────────────────────────────────────
import { callActorSafe, limits } from "@/lib/stellensignale/apify";
import type { MapsTreffer } from "@/types/stellensignale";

const GMAPS_ACTOR = process.env.APIFY_GMAPS_ACTOR ?? "compass/crawler-google-places";

export function mapsAktiv(): boolean {
  return process.env.STELLENSIGNALE_MAPS === "true";
}

function str(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// PLZ aus einer deutschen Adresse ziehen ("Musterstr. 1, 26123 Oldenburg").
function plzAus(adresse: string | null): string | null {
  if (!adresse) return null;
  return adresse.match(/\b(\d{5})\b/)?.[1] ?? null;
}

export async function discoverMaps(ort: string, suchbegriff: string): Promise<MapsTreffer[]> {
  if (!mapsAktiv()) return [];
  const items = await callActorSafe(GMAPS_ACTOR, {
    searchStringsArray: [`${suchbegriff} ${ort}`],
    language: "de",
    maxCrawledPlacesPerSearch: limits().maxItems,
    skipClosedPlaces: true,
  });

  const treffer: MapsTreffer[] = [];
  for (const it of items) {
    const firma = str(it, ["title", "name"]);
    if (!firma) continue;
    const adresse = str(it, ["address", "street"]);
    const kategorien = Array.isArray(it.categories) ? (it.categories as unknown[]) : [];
    treffer.push({
      firma,
      website: str(it, ["website", "url"]),
      ort: str(it, ["city"]) ?? ort,
      plz: str(it, ["postalCode"]) ?? plzAus(adresse),
      telefon: str(it, ["phone", "phoneUnformatted"]),
      kategorie:
        str(it, ["categoryName"]) ??
        (typeof kategorien[0] === "string" ? (kategorien[0] as string) : null),
      bewertungen: typeof it.reviewsCount === "number" ? it.reviewsCount : null,
    });
  }
  return treffer;
}
