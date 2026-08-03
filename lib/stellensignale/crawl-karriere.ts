// ─────────────────────────────────────────────────────────────────
// Crawl-Adapter: KARRIERESEITE (Phase 1b — echter HTTP-Fetch).
//
// Sucht auf der Website einer bekannten Firma die Karriereseite und liest die
// dort inserierten Stellen aus. Bewusst OHNE Apify und ohne API-Key: reiner
// fetch, kostet nichts, und liefert genau die Stellen, die auf Plattformen oft
// gar nicht auftauchen.
//
// Der Parser arbeitet mit Regex statt DOM, weil das Projekt keinen HTML-Parser
// mitbringt. Das ist für diese Aufgabe vertretbar: gesucht werden Überschriften
// und Linktexte, keine verschachtelte Struktur.
//
// Leitplanken, damit ein Crawl niemand belästigt oder ins Vercel-Timeout läuft:
//   • pro Firma höchstens MAX_SEITEN Abrufe
//   • harter Timeout je Abruf
//   • Abbruch, sobald eine Karriereseite mit Treffern gefunden wurde
//   • eigener User-Agent, damit der Crawl zuordenbar ist
// ─────────────────────────────────────────────────────────────────
import { KARRIERE_PFADE } from "@/lib/stellensignale/constants";
import type { RohAnzeige, Zielfirma } from "@/types/stellensignale";

export interface KarriereCrawlResult {
  anzeigen: RohAnzeige[];
  // Falls beim Crawl eine karriere_url ermittelt wurde → Pipeline speichert sie.
  ermittelteKarriereUrl: string | null;
}

const TIMEOUT_MS = 8_000;
const MAX_SEITEN = 6;          // Gesamt-Abrufe je Firma (Startseite eingerechnet)
const MAX_ANZEIGEN = 15;       // pro Firma; mehr ist fast immer Parser-Rauschen
const USER_AGENT = "Mozilla/5.0 (compatible; PrimeSocialBot/1.0; +https://www.primesocial.de)";

/**
 * Links, denen wir NICHT folgen. Jobportale und soziale Netze führen entweder
 * hinter eine Anmeldeschranke oder zu Anzeigen, die gar nicht vom Betrieb
 * stammen. Bewerbungs-Systeme wie Personio oder Softgarden fehlen hier
 * bewusst — die gehören zum Betrieb und sollen gecrawlt werden.
 */
const PORTAL_BLOCK =
  /(linkedin|indeed|stepstone|xing|facebook|instagram|kununu|monster|jobware|meinestadt|ebay|twitter|x\.com|youtube|tiktok|glassdoor)\./i;

/** Ein Link, der auf einen Karriere-/Stellenbereich zeigt. */
const KARRIERE_HINWEIS = /(karriere|jobs?|stellen|stellenangebot|vacan|bewerb|mitarbeiter-?gesucht|wir-?suchen)/i;

/** Ein Link, der von der Karriereseite aus zur eigentlichen Stellenliste führt. */
const STELLENLISTE_HINWEIS = /(stellenangebot|offene-?stellen|aktuelle-?stellen|jobangebot|vacan|jobs)/i;

/**
 * Das mit Abstand verlässlichste Signal für eine deutsche Stellenanzeige:
 * die Geschlechtsangabe hinter dem Titel. Fast jede Anzeige trägt sie, und
 * kaum ein anderer Text auf einer Website tut das.
 */
const MWD = /\((?:m\s*[\/|]\s*w\s*[\/|]\s*[dxi]|w\s*[\/|]\s*m\s*[\/|]\s*[dxi]|m\s*[\/|]\s*w|gn)\)/i;

/** Fallback, wenn die (m/w/d)-Angabe fehlt: typische Jobwörter im Titel. */
const JOB_WORT =
  /\b(gesell|fachkraft|meister|techniker|monteur|installateur|elektroniker|elektriker|anlagenmechaniker|mechatroniker|schlosser|dachdecker|maurer|zimmerer|facharbeiter|helfer|mitarbeiter|fahrer|schweißer|schweisser|bauleiter|polier|servicetechniker|kundendiensttechniker|vorarbeiter|azubi|auszubildende)/i;

/** Wörter, die eine Überschrift als Nicht-Stelle entlarven. */
const KEIN_TITEL =
  /\b(cookie|datenschutz|impressum|newsletter|kontakt|anfahrt|über uns|ueber uns|unsere leistungen|referenzen|startseite|jetzt bewerben|initiativbewerbung|offene stellen|stellenangebote|karriere|jobs|wir suchen|deine vorteile|ihre vorteile|das bieten wir|benefits)\b/i;

function normalizeBase(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

async function fetchRoh(url: string): Promise<string | null> {
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
    // Keine PDFs oder Bilder durch den HTML-Parser jagen.
    const typ = res.headers.get("content-type") ?? "";
    if (typ && !typ.includes("text/html")) return null;
    return await res.text();
  } catch {
    // Timeout, DNS-Fehler, TLS-Problem — für den Crawl alles dasselbe.
    return null;
  }
}

/**
 * Holt eine Seite und folgt dabei auch Meta-Refresh-Weiterleitungen
 * (<meta http-equiv="refresh" content="0; url=...">). Weder fetch noch curl
 * folgen denen von sich aus, weil es keine HTTP-Weiterleitung ist — in der
 * Praxis leiten aber genau so viele Karriereseiten auf ihr Bewerbersystem um.
 * Ohne das endet der Crawl auf einer 300 Byte großen leeren Seite.
 */
async function fetchPage(url: string, tiefe = 0): Promise<string | null> {
  const html = await fetchRoh(url);
  if (!html || tiefe >= 2) return html;

  const meta = html.match(
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"';]+)["']/i,
  );
  if (!meta) return html;

  const ziel = absolut(url, meta[1].trim());
  if (!ziel || ziel === url) return html;
  return fetchPage(ziel, tiefe + 1);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&auml;/gi, "ä").replace(/&ouml;/gi, "ö").replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/gi, "Ä").replace(/&Ouml;/gi, "Ö").replace(/&Uuml;/gi, "Ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/&#\d+;/g, " ")
    // BOM und Zero-Width-Zeichen: stehen in der Praxis mitten in Stellentiteln
    // und würden sonst Längen- und Vergleichsprüfungen verfälschen.
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sieht dieser Text nach einem Stellentitel aus? */
function istStellentitel(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 120) return false;
  if (KEIN_TITEL.test(t)) return false;
  // Fließtext aussortieren: echte Titel haben keine Satzzeichen am Ende
  // und bestehen aus wenigen Wörtern.
  if (/[.!?]\s*$/.test(t)) return false;
  if (t.split(/\s+/).length > 14) return false;
  return MWD.test(t) || JOB_WORT.test(t);
}

/**
 * Kandidaten aus Überschriften und Linktexten ziehen. Beides sind die Stellen,
 * an denen Stellentitel auf Karriereseiten praktisch immer stehen.
 */
function extrahiereTitel(html: string, nurMitMwd = false): { titel: string; url: string | null }[] {
  const treffer: { titel: string; url: string | null }[] = [];
  const gesehen = new Set<string>();

  const merke = (roh: string, url: string | null) => {
    // Führende Anführungszeichen und spitze Klammern stammen aus Attributen,
    // deren Wert selbst ein > oder " enthält. Sie gehören nie zum Titel.
    const titel = stripHtml(roh).replace(/^["'>\s]+/, "").replace(/[<"'\s]+$/, "");
    if (!istStellentitel(titel)) return;
    const key = titel.toLowerCase();
    if (gesehen.has(key)) return;
    gesehen.add(key);
    treffer.push({ titel, url });
  };

  // Überschriften h1-h4
  for (const m of html.matchAll(/<h[1-4][^>]*>([\s\S]{3,300}?)<\/h[1-4]>/gi)) {
    merke(m[1], null);
  }
  // Linktexte (mit Ziel-URL, falls die Anzeige eine Unterseite hat)
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{3,300}?)<\/a>/gi)) {
    merke(m[2], m[1]);
  }
  // Listenelemente — manche Seiten listen Stellen als <li> ohne Link
  for (const m of html.matchAll(/<li[^>]*>([\s\S]{3,300}?)<\/li>/gi)) {
    merke(m[1], null);
  }
  // title=/aria-label=-Attribute. Auf JavaScript-gerenderten Seiten steht der
  // sichtbare Text oft noch nicht im HTML, der Stellentitel aber sehr wohl im
  // Attribut — dort holen wir ihn ab.
  for (const m of html.matchAll(/(?:title|aria-label)=["']([^"']{8,120})["']/gi)) {
    merke(m[1], null);
  }

  // Die (m/w/d)-Angabe ist das mit Abstand verlässlichste Merkmal einer echten
  // Anzeige. Gibt es auf der Seite auch nur einen solchen Titel, verwerfen wir
  // alle übrigen: sonst rutschen Navigationspunkte wie "Techniker & Ingenieure"
  // oder "Meisterausbildung" als vermeintliche Stellen durch.
  const mitMwd = treffer.filter((x) => MWD.test(x.titel));
  if (mitMwd.length > 0) return mitMwd;
  if (nurMitMwd) return [];

  // Ohne (m/w/d) bleibt nur der Jobwort-Fallback, und der ist ungenau: Auf
  // einer Karriereseite matchen darauf auch Menüpunkte wie "Techniker &
  // Ingenieure" oder "Meisterausbildung". Ein Fehltreffer ist hier teuer — er
  // legt ein Signal an und taucht später als erfundener Stellentitel in der
  // Kaltakquise-Mail auf. Deshalb standardmäßig aus.
  // Mit STELLENSIGNALE_KARRIERE_LOCKER=true einschalten, wenn sich in der
  // Praxis zeigt, dass zu viele kleine Betriebe ohne (m/w/d) inserieren.
  if (process.env.STELLENSIGNALE_KARRIERE_LOCKER !== "true") return [];
  return treffer;
}

/** Erste E-Mail-Adresse auf der Seite — dient dem Domain-Abgleich im Filter. */
function ersteEmail(html: string): string | null {
  const m = html.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (!m) return null;
  const mail = m[0].toLowerCase();
  // Bildnamen und Ähnliches aussortieren.
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(mail)) return null;
  return mail;
}

function absolut(basis: string, href: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, basis).toString();
  } catch {
    return null;
  }
}

/**
 * Links einer Seite einsammeln, die auf einen Karriere-/Stellenbereich zeigen.
 * Geprüft wird sowohl die URL als auch der sichtbare Linktext, weil viele
 * Seiten "Offene Stellen" auf eine kryptische URL legen.
 */
function findeKarriereLinks(html: string, basisUrl: string, muster: RegExp): string[] {
  const gefunden: string[] = [];
  const gesehen = new Set<string>();

  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = m[1];
    const text = stripHtml(m[2]);
    if (!muster.test(href) && !muster.test(text)) continue;

    const url = absolut(basisUrl, href);
    if (!url || !url.startsWith("http")) continue;
    if (PORTAL_BLOCK.test(url)) continue;
    // Feed-, API- und Datei-Links überspringen.
    if (/\/wp-json\/|\.(pdf|jpe?g|png|zip|docx?)$|\?.*oembed/i.test(url)) continue;

    const key = url.replace(/#.*$/, "").replace(/\/$/, "");
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    gefunden.push(url);
  }
  return gefunden;
}

export async function crawlKarriereseite(firma: Zielfirma): Promise<KarriereCrawlResult> {
  const leer: KarriereCrawlResult = { anzeigen: [], ermittelteKarriereUrl: null };

  const basis = normalizeBase(firma.karriere_url ?? firma.website ?? "");
  if (!basis) return leer;

  let abrufe = 0;
  const fetchZaehlend = async (url: string): Promise<string | null> => {
    if (abrufe >= MAX_SEITEN) return null;
    abrufe++;
    return fetchPage(url);
  };

  // Aus einer Seite Anzeigen bauen — oder null, wenn keine Titel drinstehen.
  const ernte = (html: string, url: string, nurMitMwd = false): KarriereCrawlResult | null => {
    const titel = extrahiereTitel(html, nurMitMwd);
    if (titel.length === 0) return null;
    const seitenText = stripHtml(html);
    const bewerbungEmail = ersteEmail(html);

    // raw_text bleibt auf einer Stellenliste bewusst LEER.
    //
    // Naheliegend wäre, jeder Anzeige den Seitentext oder ein Textfenster um
    // den Titel mitzugeben. Beides ist hier falsch: Auf einer Übersichtsseite
    // stehen die Anzeigen unmittelbar nebeneinander, jedes Fenster greift also
    // in die Nachbaranzeige. Steht dort "Azubi", schlägt in istFachkraft() das
    // Negativsignal zu und die eigentliche Fachkraft-Stelle fällt durch —
    // gemessen an einer echten Seite waren so 0 von 15 Stellen verwertbar.
    //
    // Der Titel allein ist auf Listenseiten das verlässlichere Signal. Echten
    // Anzeigentext gäbe es nur über einen Abruf je Einzelanzeige; das wäre ein
    // Fetch pro Stelle statt pro Firma und ist bewusst nicht Teil dieser Stufe.
    return {
      ermittelteKarriereUrl: url,
      anzeigen: titel.slice(0, MAX_ANZEIGEN).map((t) => ({
        stellentitel: t.titel,
        quelle: "karriereseite" as const,
        quelle_url: absolut(url, t.url) ?? url,
        raw_text: null,
        // Auf der eigenen Karriereseite inseriert der Betrieb selbst — der
        // Blacklist-Check greift hier über den Firmennamen, nicht über einen
        // fremden Inserenten.
        inserent: firma.firma,
        bewerbung_email: bewerbungEmail,
      })),
    };
  };

  // ── Stufe 1: Kandidaten für die Karriereseite sammeln ──
  // Reihenfolge nach Treffsicherheit: bekannte URL, dann was die Startseite
  // verlinkt, dann geratene Standardpfade. Feste Pfade allein reichen nicht —
  // viele Betriebe legen ihre Stellen auf eine eigene Domain oder Unterseite.
  const kandidaten: string[] = [];
  const merke = (u: string) => {
    const key = u.replace(/#.*$/, "").replace(/\/$/, "");
    if (!kandidaten.some((k) => k.replace(/#.*$/, "").replace(/\/$/, "") === key)) kandidaten.push(u);
  };

  if (firma.karriere_url) merke(firma.karriere_url);

  const startseite = await fetchZaehlend(basis);
  if (startseite) {
    for (const u of findeKarriereLinks(startseite, basis, KARRIERE_HINWEIS)) merke(u);
    // Manche kleinen Betriebe listen ihre Stellen direkt auf der Startseite.
    // Hier aber NUR mit (m/w/d)-Nachweis — auf einer Startseite ist jeder
    // Jobwort-Treffer sonst mit hoher Wahrscheinlichkeit ein Menüpunkt.
    const direkt = ernte(startseite, basis, true);
    if (direkt) return direkt;
  }
  for (const pfad of KARRIERE_PFADE) merke(`${basis}${pfad}`);

  // ── Stufe 2: Kandidaten abklappern ──
  const tiefer: string[] = [];
  for (const url of kandidaten) {
    const html = await fetchZaehlend(url);
    if (!html) continue;

    const treffer = ernte(html, url);
    if (treffer) return treffer;

    // Keine Titel gefunden: oft ist das eine Landingpage ("Werde Teil des
    // Teams"), die erst auf die eigentliche Stellenliste verlinkt.
    for (const u of findeKarriereLinks(html, url, STELLENLISTE_HINWEIS)) {
      if (!kandidaten.includes(u) && !tiefer.includes(u)) tiefer.push(u);
    }
  }

  // ── Stufe 3: eine Ebene tiefer ──
  for (const url of tiefer) {
    const html = await fetchZaehlend(url);
    if (!html) continue;
    const treffer = ernte(html, url);
    if (treffer) return treffer;
  }

  return leer;
}
