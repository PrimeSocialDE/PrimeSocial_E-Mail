// ─────────────────────────────────────────────────────────────────
// FIRMENSUCHE über OpenStreetMap (Overpass-API).
//
// Zweck: die Betriebe finden, die auf keiner Gewerke-Suchliste stehen —
// Produktionsbetriebe, Maschinenbauer, Werke. Eine Suche nach "Elektriker
// Oldenburg" zeigt die nie, weil sie nicht danach benannt sind. OSM klassifiziert
// dagegen nach ART DES BETRIEBS (man_made=works, industrial=*, craft=*), und
// genau darüber lassen sie sich gezielt einsammeln.
//
// Kostenlos, kein Schlüssel, Daten unter ODbL. Overpass ist ein von Freiwilligen
// betriebener Dienst — deshalb: großzügige Timeouts, kleine Trefferzahlen,
// Pausen zwischen Abfragen, aussagekräftiger User-Agent.
//
// Liefert KEINE Stellensignale, nur Firmen samt Website. Ob ein Betrieb sucht,
// klärt danach die Arbeitsagentur-Discovery oder der Karriere-Crawl.
// ─────────────────────────────────────────────────────────────────

const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "PrimeSocialBot/1.0 (+https://www.primesocial.de; Recruiting-Recherche)";
const OVERPASS_TIMEOUT_MS = 90_000;
const NOMINATIM_TIMEOUT_MS = 15_000;

export interface OsmFirma {
  firma: string;
  ort: string | null;
  plz: string | null;
  website: string | null;
  /** Rohe OSM-Klassifikation, z.B. "works", "craft:carpenter", "product:bricks". */
  kategorie: string | null;
}

export function osmAktiv(): boolean {
  return process.env.STELLENSIGNALE_OSM === "true";
}

// Geokodierung je Ort nur einmal pro Prozess — Nominatim bittet ausdrücklich
// darum, Ergebnisse zwischenzuspeichern statt sie erneut abzufragen.
const geoCache = new Map<string, { lat: number; lon: number } | null>();

async function geokodiere(ort: string): Promise<{ lat: number; lon: number } | null> {
  const key = ort.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key) ?? null;

  try {
    const url = `${NOMINATIM}?${new URLSearchParams({
      q: ort, format: "json", limit: "1", countrycodes: "de",
    })}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NOMINATIM_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) { geoCache.set(key, null); return null; }
    const daten = (await res.json()) as { lat?: string; lon?: string }[];
    const erster = daten[0];
    if (!erster?.lat || !erster?.lon) { geoCache.set(key, null); return null; }
    const punkt = { lat: parseFloat(erster.lat), lon: parseFloat(erster.lon) };
    geoCache.set(key, punkt);
    return punkt;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

interface OverpassElement {
  tags?: Record<string, string>;
}

interface OverpassAntwort {
  elements?: OverpassElement[];
  /**
   * Overpass meldet Laufzeitfehler NICHT über den HTTP-Status, sondern als
   * "remark" im Body — bei HTTP 200 und leerer elements-Liste. Wer das nicht
   * auswertet, hält einen Timeout für "keine Treffer gefunden" und sucht den
   * Fehler an der völlig falschen Stelle.
   */
  remark?: string;
}

/** Eine einzelne Overpass-Abfrage. Trennt echte Leere von einem Serverfehler. */
async function frageOverpass(query: string): Promise<{ elemente: OverpassElement[]; fehler: string | null }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
    const res = await fetch(OVERPASS, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    });
    clearTimeout(timer);
    if (!res.ok) return { elemente: [], fehler: `HTTP ${res.status}` };

    const daten = (await res.json()) as OverpassAntwort;
    if (daten.remark) return { elemente: [], fehler: `Overpass: ${daten.remark.slice(0, 120)}` };
    return { elemente: daten.elements ?? [], fehler: null };
  } catch (e) {
    return { elemente: [], fehler: e instanceof Error ? e.message : String(e) };
  }
}

/** Klassifikation für die spätere Zuordnung lesbar zusammenfassen. */
function kategorieVon(tags: Record<string, string>): string | null {
  if (tags.product) return `product:${tags.product}`;
  if (tags.craft) return `craft:${tags.craft}`;
  if (tags.industrial) return `industrial:${tags.industrial}`;
  if (tags["man_made"] === "works") return "works";
  if (tags.office) return `office:${tags.office}`;
  return null;
}

function websiteVon(tags: Record<string, string>): string | null {
  const roh = tags.website ?? tags["contact:website"] ?? tags.url ?? null;
  if (!roh) return null;
  const url = roh.trim();
  if (!url) return null;
  return url.startsWith("http") ? url : `https://${url}`;
}

/**
 * Betriebe im Umkreis eines Ortes finden.
 *
 * @param ort     Ortsname, wird über Nominatim geokodiert
 * @param radiusM Umkreis in Metern (Default 40 km)
 */
export async function discoverOsm(ort: string, radiusM?: number): Promise<OsmFirma[]> {
  if (!osmAktiv()) return [];

  const punkt = await geokodiere(ort);
  if (!punkt) return [];

  const radius = radiusM ?? parseInt(process.env.STELLENSIGNALE_OSM_RADIUS_M ?? "30000", 10);
  const rundum = `(around:${radius},${punkt.lat},${punkt.lon})`;

  // Alle vier Klassifikationen in EINER Abfrage lässt Overpass bei 40 km
  // Radius in den Timeout laufen (gemessen: 95 s, dann Abbruch mit "remark").
  // Deshalb je Kategorie eine eigene, kleine Abfrage — langsamer, aber
  // zuverlässig, und ein Ausfall betrifft nur eine Kategorie statt aller.
  const filter = [
    "[man_made=works][name]",
    "[industrial][name]",
    "[craft][name]",
    "[office=company][name]",
  ];

  const firmen: OsmFirma[] = [];
  const gesehen = new Set<string>();

  for (const f of filter) {
    const { elemente, fehler } = await frageOverpass(
      `[out:json][timeout:60];nwr${f}${rundum};out center tags;`,
    );
    if (fehler) {
      // Eine ausgefallene Kategorie ist kein Grund, den ganzen Lauf zu kippen.
      console.warn(`[osm] ${ort} ${f}: ${fehler}`);
      continue;
    }

    for (const el of elemente) {
      const tags = el.tags ?? {};
      const name = (tags.name ?? "").trim();
      if (!name) continue;

      // Dieselbe Firma steht in OSM oft mehrfach (Gebäude, Fläche, Punkt).
      const key = name.toLowerCase();
      if (gesehen.has(key)) continue;
      gesehen.add(key);

      firmen.push({
        firma: name,
        ort: tags["addr:city"] ?? null,
        plz: tags["addr:postcode"] ?? null,
        website: websiteVon(tags),
        kategorie: kategorieVon(tags),
      });
    }

    // Overpass ist ein Freiwilligendienst, keine Selbstbedienung.
    await new Promise((r) => setTimeout(r, 1500));
  }

  return firmen;
}
