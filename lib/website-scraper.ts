/**
 * website-scraper.ts
 * Scrapet Unternehmenswebseiten nach Kontaktdaten.
 * Fokus: deutsches Impressum → GF-Name + persönliche E-Mail.
 */

export interface WebsiteContact {
  emails: string[];               // alle gefundenen E-Mails, beste zuerst
  bestEmail: string | null;       // wahrscheinlich persönliche GF-Mail
  gfName: string | null;          // Geschäftsführer / Inhaber Name
  phone: string | null;
  companyName: string | null;
  address: string | null;
  websiteSummary: string | null;  // Kurzbeschreibung aus Meta-Tags / Homepage
  personen: Person[];             // aus Team-/Über-uns-Seiten, beste zuerst
}

/** Eine auf der Website gefundene Person: Name, Funktion, ggf. eigene Adresse. */
export interface Person {
  name: string;
  rolle: string | null;
  email: string | null;
  /** Je hoeher, desto besser als Empfaenger fuer eine Recruiting-Ansprache. */
  rang: number;
}

// ─────────────────────────────────────────────────────────────────
// Hilfsfunktionen
// ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_RE = /(?:\+49|0049|0)[\s\-./]?\(?\d{2,5}\)?[\s\-./]?\d{2,8}(?:[\s\-./]?\d{1,5})*/;

// E-Mails die sehr wahrscheinlich keine persönliche GF-Mail sind
const GENERIC_PREFIXES = [
  "info", "hallo", "hello", "kontakt", "contact", "service", "support",
  "mail", "email", "office", "admin", "noreply", "no-reply", "webmaster",
  "marketing", "sales", "vertrieb", "anfrage", "anfragen", "redaktion",
  "presse", "press", "team", "post", "buchung", "booking", "bestellung",
  "order", "shop", "help", "hilfe", "sekretariat", "empfang",
];

function isGenericEmail(email: string): boolean {
  const local = email.split("@")[0].toLowerCase();
  return GENERIC_PREFIXES.some((p) => local === p || local.startsWith(p + "."));
}

function rankEmails(emails: string[]): string[] {
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))];
  // persönliche Mails (mit Punkt oder Bindestrich im local-part) zuerst
  return unique.sort((a, b) => {
    const aPersonal = !isGenericEmail(a) && /[.\-_]/.test(a.split("@")[0]);
    const bPersonal = !isGenericEmail(b) && /[.\-_]/.test(b.split("@")[0]);
    if (aPersonal && !bPersonal) return -1;
    if (!aPersonal && bPersonal) return 1;
    if (!isGenericEmail(a) && isGenericEmail(b)) return -1;
    if (isGenericEmail(a) && !isGenericEmail(b)) return 1;
    return 0;
  });
}

function extractEmails(html: string): string[] {
  // Auch E-Mails die als "user [at] domain.de" oder "user(at)domain" kodiert sind
  const decoded = html
    .replace(/\[at\]/gi, "@")
    .replace(/\(at\)/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/&#64;/g, "@")
    .replace(/&amp;/g, "&");
  return [...(decoded.match(EMAIL_RE) ?? [])];
}

// GF/Inhaber aus Impressum-Text extrahieren
const GF_PATTERNS = [
  /Gesch[äae]ftsf[üu]hrer[in]*[:\s]+([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)/,
  /Inhaber[in]*[:\s]+([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)/,
  /Gr[üu]nder[in]*[:\s]+([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)/,
  /CEO[:\s]+([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)/,
  /Vorstand[:\s]+([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)/,
  /vertreten durch[:\s]+([A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)?)/i,
];

/**
 * Woerter, die niemals Teil eines Personennamens sind. Das Impressum-Muster
 * greift oft ueber den Namen hinaus in die Navigation ("Georg Stapelfeld
 * Kontakt") oder in die Rechtsform. Ungeprueft wuerde daraus in der Mail die
 * Anrede "Moin Herr Kontakt" — schlimmer als gar kein Name.
 */
const KEIN_NAMENSTEIL =
  /\b(kontakt|impressum|datenschutz|startseite|home|team|karriere|jobs?|leistungen|über|ueber|uns|gmbh|mbh|kg|ohg|ag|se|gbr|inhaber|geschäftsführer|geschaeftsfuehrer|vertreten|telefon|email|e-mail|adresse|anschrift|sitz|handelsregister|str|straße|strasse|weg|platz)\b/i;

/**
 * Erkannten Namen plausibilisieren. Lieber null als ein falscher Name:
 * ohne Namen gruesst die Mail mit "Moin zusammen", das ist immer korrekt.
 */
function plausibelerName(roh: string): string | null {
  let name = roh.trim().replace(/\s+/g, " ");

  // Ueberhaengende Navigationswoerter hinten abschneiden.
  const teile = name.split(" ");
  while (teile.length > 2 && KEIN_NAMENSTEIL.test(teile[teile.length - 1])) teile.pop();
  name = teile.join(" ");

  if (teile.length < 2 || teile.length > 3) return null;   // Vor- + Nachname, evtl. Zweitname
  if (name.length < 5 || name.length > 45) return null;
  if (/\d/.test(name)) return null;                        // Ziffern gehoeren nicht in Namen
  if (KEIN_NAMENSTEIL.test(name)) return null;             // Rest enthaelt noch ein Fremdwort
  if (!/^[A-ZÄÖÜ]/.test(name)) return null;
  return name;
}

function extractGfName(text: string): string | null {
  for (const re of GF_PATTERNS) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const geprueft = plausibelerName(m[1]);
    if (geprueft) return geprueft;
  }
  return null;
}

/**
 * Personen aus Team- und Über-uns-Seiten ziehen.
 *
 * Warum das lohnt: Eine persoenliche Adresse ist in der Erreichbarkeits-
 * Bewertung drei Punkte wert, ein info@ nur einen. Und Teamseiten nennen die
 * Funktion gleich mit — wer "Personalleitung" macht, ist fuer eine
 * Recruiting-Mail der deutlich bessere Empfaenger als die Zentrale.
 * Kostet nichts: die Seiten werden ohnehin abgerufen.
 *
 * Verfahren: Um jede gefundene E-Mail ein Textfenster legen und darin nach
 * einem Personennamen und einer Funktionsbezeichnung suchen. Das ist robuster
 * als HTML-Struktur zu parsen, die auf jeder Website anders aussieht.
 */
const ROLLEN: { muster: RegExp; label: string; rang: number }[] = [
  { muster: /(personalleit|personalreferent|hr[- ]?manager|human resources|recruiting|personalabteilung)/i, label: "Personal", rang: 5 },
  { muster: /(gesch[äa]ftsf[üu]hr|inhaber|geschäftsleitung|geschaeftsleitung)/i,                            label: "Geschäftsführung", rang: 4 },
  { muster: /(prokurist|betriebsleit|niederlassungsleit|standortleit)/i,                                    label: "Leitung", rang: 3 },
  { muster: /(b[üu]roleit|verwaltung|assistenz|sekretariat)/i,                                              label: "Verwaltung", rang: 2 },
];

const NAME_RE = /\b([A-ZÄÖÜ][a-zäöüß]{2,}(?:-[A-ZÄÖÜ][a-zäöüß]{2,})?)\s+([A-ZÄÖÜ][a-zäöüß]{2,}(?:-[A-ZÄÖÜ][a-zäöüß]{2,})?)\b/g;

function extractPersonen(seitentext: string): Person[] {
  const gefunden = new Map<string, Person>();

  for (const m of seitentext.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase();
    if (isGenericEmail(email)) continue;           // info@ gehoert keiner Person
    const pos = m.index ?? 0;
    const fenster = seitentext.slice(Math.max(0, pos - 250), pos + 150);

    // Rolle im Umfeld?
    let rolle: string | null = null;
    let rang = 1;
    for (const r of ROLLEN) {
      if (r.muster.test(fenster)) { rolle = r.label; rang = r.rang; break; }
    }

    // Name im Umfeld — der letzte vor der Adresse ist meist der richtige.
    const namen = [...fenster.matchAll(NAME_RE)]
      .map((n) => `${n[1]} ${n[2]}`)
      .filter((n) => !KEIN_NAMENSTEIL.test(n));
    const name = namen.length > 0 ? namen[namen.length - 1] : null;
    if (!name) continue;

    // Zusatzpunkt, wenn der Nachname in der Adresse vorkommt — dann gehoeren
    // Name und Mail nachweislich zusammen und sind nicht nur Nachbarn im Text.
    const nachname = name.split(" ")[1].toLowerCase();
    if (nachname.length > 3 && email.split("@")[0].includes(nachname.slice(0, 4))) rang += 2;

    const vorhanden = gefunden.get(email);
    if (!vorhanden || vorhanden.rang < rang) gefunden.set(email, { name, rolle, email, rang });
  }

  return [...gefunden.values()].sort((a, b) => b.rang - a.rang);
}

function extractPhone(text: string): string | null {
  return text.match(PHONE_RE)?.[0]?.trim() ?? null;
}

function extractMetaDescription(html: string): string | null {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,300})["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']{20,300})["'][^>]+name=["']description["']/i);
  if (m?.[1]) return m[1].trim();

  const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,300})["']/i);
  if (og?.[1]) return og[1].trim();

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PrimeSocialBot/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function normalizeBase(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return url.startsWith("http") ? url : `https://${url}`;
  }
}

// ─────────────────────────────────────────────────────────────────
// Haupt-Funktion
// ─────────────────────────────────────────────────────────────────
export async function scrapeWebsiteForContact(websiteUrl: string): Promise<WebsiteContact> {
  const base = normalizeBase(websiteUrl);

  // Seiten die wir abrufen (Impressum hat Priorität)
  const pageSlugs = [
    "/impressum",
    "/impressum.html",
    "/impressum.php",
    "/legal/impressum",
    "/de/impressum",
    "/kontakt",
    "/contact",
    "/ueber-uns",
    "/ueber-uns/team",
    "/team",
    "/about",
    "",   // Homepage zuletzt
  ];

  const allEmails: string[] = [];
  let personenText = "";
  let gfName: string | null = null;
  let phone: string | null = null;
  let companyName: string | null = null;
  let websiteSummary: string | null = null;
  let impressumText = "";

  // Alle Seiten parallel abrufen (mit kleinem Delay damit wir nicht geblockt werden)
  const results = await Promise.allSettled(
    pageSlugs.map(async (slug, i) => {
      // kleiner Jitter
      await new Promise((r) => setTimeout(r, i * 200));
      const html = await fetchPage(`${base}${slug}`);
      return { slug, html };
    })
  );

  for (const res of results) {
    if (res.status !== "fulfilled" || !res.value.html) continue;
    const { slug, html } = res.value;
    const text = stripHtml(html);

    // E-Mails sammeln
    const found = extractEmails(html);
    allEmails.push(...found);

    // Team-/Über-uns-Seiten sammeln wir für die Personen-Extraktion.
    if (/team|ueber-uns|about|kontakt/.test(slug)) personenText += " " + text;

    // Impressum-spezifische Extraktion
    if (slug.includes("impressum")) {
      impressumText = text;
      if (!gfName) gfName = extractGfName(text);
      if (!phone) phone = extractPhone(text);

      // Firmenname aus Impressum (erste Zeile / H1 / strong)
      const h1 = html.match(/<h1[^>]*>([^<]{3,80})<\/h1>/i);
      if (h1?.[1] && !companyName) companyName = stripHtml(h1[1]).trim();
    }

    // Meta-Description von der Homepage
    if (slug === "" && !websiteSummary) {
      websiteSummary = extractMetaDescription(html);
      const title = html.match(/<title[^>]*>([^<]{3,100})<\/title>/i);
      if (title?.[1] && !companyName) {
        companyName = stripHtml(title[1]).split("|")[0].split("–")[0].split("-")[0].trim();
      }
    }
  }

  // E-Mails ranken
  const ranked = rankEmails(allEmails);

  // Beste E-Mail: wenn GF-Name bekannt, suche nach passender Mail
  let bestEmail: string | null = null;
  if (gfName) {
    const parts = gfName.toLowerCase().split(/\s+/);
    const gfMatch = ranked.find((e) => {
      const local = e.split("@")[0].toLowerCase();
      return parts.some((p) => local.includes(p) && p.length > 2);
    });
    bestEmail = gfMatch ?? null;
  }
  if (!bestEmail) {
    bestEmail = ranked.find((e) => !isGenericEmail(e)) ?? ranked[0] ?? null;
  }

  const personen = extractPersonen(personenText);

  // Beste Person schlaegt die generische Adresse: Eine Mail an
  // personal@ oder an die namentlich genannte Personalleitung wird gelesen,
  // eine an info@ landet im Sammelpostfach.
  if (personen.length > 0 && personen[0].email) {
    if (!bestEmail || isGenericEmail(bestEmail)) bestEmail = personen[0].email;
    if (!gfName) gfName = personen[0].name;
  }

  return {
    emails: ranked,
    bestEmail,
    gfName,
    phone,
    companyName,
    address: null,   // könnte man noch extrahieren
    websiteSummary,
    personen,
  };
}
