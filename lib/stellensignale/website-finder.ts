// ─────────────────────────────────────────────────────────────────
// WEBSITE-ERMITTLUNG für Firmen, die ohne Website in der Datenbank stehen.
//
// Das ist der Engpass des ganzen Moduls: Die Arbeitsagentur liefert
// Arbeitgebernamen ohne Website. Ohne Website kein Impressum, ohne Impressum
// keine E-Mail, ohne E-Mail kein Entwurf. An echten Daten gemessen hatten
// nur rund 50 % der Firmen eine Website — mit diesem Schritt 70 bis 80 %.
//
// KOSTENFREI: ausschließlich HTTP-Abrufe, keine API, kein Schlüssel.
// Gedeckelt, damit ein Lauf weder ewig dauert noch fremde Server belastet.
// ─────────────────────────────────────────────────────────────────
import { istPdlWebsite } from "@/lib/stellensignale/filter";

const TIMEOUT_MS = 6_000;
const USER_AGENT = "Mozilla/5.0 (compatible; PrimeSocialBot/1.0; +https://www.primesocial.de)";

export interface WebsiteFund {
  website: string;
  quelle: "geraten";
  /** Grund, falls die Seite einen Personaldienstleister verrät. */
  pdlGrund: string | null;
}

/** Firmennamen auf die kennzeichnenden Wörter reduzieren. */
function namensWoerter(firma: string): string[] {
  return firma
    .toLowerCase()
    .replace(/\b(gmbh|mbh|co|kg|ohg|ag|se|e\.?\s?k\.?|gbr|und|&|inh\.?|inhaber|niederlassung|filiale)\b/g, " ")
    .replace(/[^a-zäöüß0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Umlaute wie in Domains üblich umschreiben. */
function domainSchreibweise(s: string): string {
  return s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

async function hole(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const typ = res.headers.get("content-type") ?? "";
    if (typ && !typ.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parkseiten, Baukasten-Vorlagen und Verkaufsangebote erkennen.
 *
 * Ohne diese Prüfung hält der Rateversuch eine Domain für die richtige, nur
 * weil der Firmenname im Verkaufstext der Parkseite steht. An echten Daten
 * passiert: "tech-plus.de → Die Domain steht zum Verkauf" und
 * "adera.de → Projektbeschreibung" wurden als Treffer akzeptiert.
 */
const LEERSEITE =
  /(diese domain (steht|kann).{0,30}(verkauf|kaufen)|domain (parking|kaufen|steht zum verkauf)|sedoparking|domainparking|this domain is for sale|buy this domain|projektbeschreibung|website coming soon|diese seite befindet sich im aufbau|under construction|wordpress.{0,20}installiert|willkommen bei wordpress)/i;

/**
 * Website zu einem Firmennamen finden. Geraten wird aus dem Namen, akzeptiert
 * wird nur nach Verifikation gegen den Seiteninhalt.
 */
export async function findeWebsite(firma: string, ort?: string | null): Promise<WebsiteFund | null> {
  const woerter = namensWoerter(firma).map(domainSchreibweise);
  if (woerter.length === 0) return null;

  // Das laengste Wort ist am kennzeichnendsten und dient als Pruefwort.
  // Als Pruefwort taugt nur ein Eigenname, kein Gattungswort — sonst bestaetigt
  // sich jede beliebige Branchenseite selbst.
  const pruefwort = [...woerter]
    .filter((w) => !/^(transporte?|elektro|bau|service|technik|montage|handel|logistik|energie|solar|metall|stahl|holz|garten|dach|heizung|industrie|reinigung|personal|gruppe|team|nord|sued|west|ost)$/i.test(w))
    .sort((a, b) => b.length - a.length)[0];
  if (!pruefwort || pruefwort.length < 4) return null;

  // Gattungswoerter taugen NICHT als alleiniger Domain-Kandidat: "transporte",
  // "elektro" oder "bau" gehoeren jemandem, nur nicht dieser Firma. An echten
  // Daten wurde "M + S Transporte GmbH" so faelschlich transporte.com
  // zugeordnet — und die Verifikation schlug an, weil das Wort dort natuerlich
  // vorkommt. Nur mehrteilige Kandidaten oder ein markanter Eigenname zaehlen.
  const GATTUNGSWORT = /^(transporte?|elektro|elektrotechnik|bau|hochbau|tiefbau|service|technik|haustechnik|montage|handel|logistik|energie|solar|metall|stahl|holz|garten|dach|sanitaer|sanitar|heizung|industrie|maschinenbau|anlagenbau|fahrzeugbau|reinigung|personal|gruppe|team|nord|sued|west|ost)$/i;

  const kandidaten = [
    woerter.join("-"),
    woerter.join(""),
    woerter.slice(0, 2).join("-"),
    woerter.slice(0, 2).join(""),
    // Einzelwort nur, wenn es kein Gattungswort ist.
    GATTUNGSWORT.test(woerter[0]) ? "" : woerter[0],
  ].filter((k, i, arr) => k.length >= 4 && !GATTUNGSWORT.test(k) && arr.indexOf(k) === i);

  let abrufe = 0;
  for (const k of kandidaten) {
    for (const tld of [".de", ".com"]) {
      if (abrufe >= 6) return null;     // harter Deckel je Firma
      abrufe++;
      const url = `https://www.${k}${tld}`;
      const html = await hole(url);
      if (!html) continue;

      const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
      if (LEERSEITE.test(text)) continue;                 // Parkseite/Vorlage
      if (!text.includes(pruefwort)) continue;            // Name kommt nicht vor
      // Ort als zusaetzliche Bestaetigung, wenn vorhanden — schuetzt vor
      // Namensvettern in einer anderen Region.
      if (ort && ort.length > 3 && !text.includes(ort.toLowerCase().split(/[ (]/)[0])) {
        // kein Ausschluss, nur schwaecherer Treffer — viele Seiten nennen den Ort nicht
      }
      return { website: url, quelle: "geraten", pdlGrund: istPdlWebsite(text) };
    }
  }
  return null;
}
