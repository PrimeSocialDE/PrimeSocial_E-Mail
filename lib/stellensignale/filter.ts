// ─────────────────────────────────────────────────────────────────
// HARTER Störer-Filter für das STELLENSIGNAL-Modul.
// Läuft VOR jedem Insert. Verwirft Anzeigen von Personaldienstleistern /
// Zeitarbeit / Vermittlern. Reine Funktionen — keine DB, keine API-Calls
// (die Blacklist wird als Liste hereingereicht, nicht hier geladen).
// ─────────────────────────────────────────────────────────────────
import { STOERER_KEYWORDS } from "@/lib/stellensignale/constants";
import ausschlussData from "@/data/stellensignale-ausschluss.json";
import type { RohAnzeige, FilterErgebnis } from "@/types/stellensignale";

// ── Konzern-/Ausschluss-Filter ────────────────────────────────────
// Zielkunden sind regionale Mittelständler. Großkonzerne (AG/SE/Group …) und
// Personaldienstleister zahlen keinen Retainer → raus, bevor sie in der DB landen.
const AUSSCHLUSS_MUSTER: string[] = (ausschlussData as { muster?: string[] }).muster ?? [];
const AUSSCHLUSS_NAMEN: string[] = (ausschlussData as { namen?: string[] }).namen ?? [];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Personaldienstleister am NAMEN erkennen.
 *
 * Notwendig, seit die Arbeitsagentur-Discovery über die offizielle API läuft:
 * die liefert in der Trefferliste keinen Anzeigentext, damit läuft der
 * STOERER_KEYWORDS-Filter (der auf raw_text prüft) ins Leere. Ohne diese
 * Namensprüfung landen Zeitarbeitsfirmen ungefiltert in der Datenbank — an
 * einer echten Abfrage für Oldenburg waren das rund ein Fünftel aller Treffer.
 *
 * Bewusst als Muster statt als Namensliste: Zeitarbeitsfirmen heißen fast immer
 * nach demselben Schema, und eine Liste wäre nach drei Monaten veraltet.
 */
const PERSONALDIENSTLEISTER_MUSTER: RegExp =
  /(personal|perso\s|persona|zeitarbeit|zeitkraft|arbeitnehmer|überlassung|ueberlassung|staffing|recruit|randstad|adecco|manpower|tempton|piening|jobtimum|timecon|orizon|argo\s|expertum|avitea|actief|hito|unique\s|dis\s?ag|gulp|brunel|ferchau|sthree|hays|plusswerk|plankontor|arbeitsvermittl)/i;

// Gibt den Ausschlussgrund zurück, oder null wenn die Firma passt.
export function istAusgeschlossen(firma: string | null | undefined): string | null {
  if (!firma) return null;
  const name = firma.trim();
  if (!name) return null;

  const pdl = name.match(PERSONALDIENSTLEISTER_MUSTER);
  if (pdl) return `Personaldienstleister-Muster "${pdl[0]}"`;

  for (const m of AUSSCHLUSS_MUSTER) {
    if (new RegExp(`\\b${escapeRegex(m)}\\b`, "i").test(name)) return `Konzern-Muster "${m}"`;
  }
  const low = name.toLowerCase();
  for (const n of AUSSCHLUSS_NAMEN) {
    if (low.includes(n.toLowerCase())) return `Ausschluss-Firma "${n}"`;
  }
  return null;
}

/**
 * Personaldienstleister am WEBSITE-INHALT erkennen.
 *
 * Das verlaesslichste Merkmal ueberhaupt: Wer Arbeitnehmer ueberlaesst, MUSS
 * die Erlaubnis nach § 1 AUeG ausweisen — meist im Impressum. Namensmuster
 * lassen sich umgehen ("TECH-PLUS", "nEw siMple woRk"), diese Pflichtangabe
 * nicht.
 *
 * Wird geprueft, sobald die Website ohnehin fuer die Impressum-Mailsuche
 * abgerufen wird — kostet also keinen zusaetzlichen Abruf.
 */
const PDL_WEBSITE_MUSTER: { muster: RegExp; grund: string }[] = [
  { muster: /arbeitnehmer[üue]berlassung/i,        grund: "Arbeitnehmerüberlassung (§ 1 AÜG)" },
  { muster: /\bA[ÜU]G\b/,                          grund: "Verweis auf das AÜG" },
  { muster: /zeitarbeit/i,                          grund: "Zeitarbeit" },
  { muster: /personaldienstleist/i,                 grund: "Personaldienstleistung" },
  { muster: /personalvermittl/i,                    grund: "Personalvermittlung" },
  { muster: /personalberatung/i,                    grund: "Personalberatung" },
  { muster: /wir vermitteln .{0,20}(personal|mitarbeiter|fachkr[äa]fte)/i, grund: "vermittelt Personal" },
];

/**
 * Gibt den Ausschlussgrund zurueck, wenn der Seiteninhalt einen
 * Personaldienstleister verraet — sonst null.
 */
export function istPdlWebsite(seitentext: string | null | undefined): string | null {
  if (!seitentext) return null;
  for (const { muster, grund } of PDL_WEBSITE_MUSTER) {
    if (muster.test(seitentext)) return grund;
  }
  return null;
}

/**
 * Unbrauchbare E-Mail-Adressen erkennen.
 *
 * Zwei Faelle, beide an echten Daten aufgetreten:
 *   1. Platzhalter aus Website-Vorlagen ("benutzer@domain.com"). Eine Mail
 *      dorthin ist ein garantierter Bounce — und Bounces sind das, was eine
 *      frische Versanddomain am schnellsten beschaedigt.
 *   2. Adressen, deren Domain nichts mit der Firma zu tun hat: Der Scraper
 *      hat dann die Mail einer fremden Firma erwischt (Agentur im Footer,
 *      Web-Baukasten, Partnerlink). Ein Anschreiben ginge an den Falschen.
 */
const PLATZHALTER_MAIL =
  /^(benutzer|user|name|vorname|nachname|ihre?-?mail|deine?-?mail|beispiel|example|muster|test|demo|info)@(domain|example|beispiel|muster|test|mail|deine-?domain|ihre-?domain)\.(com|de|org|net)$/i;

/** true, wenn die Adresse offensichtlich ein Platzhalter ist. */
export function istPlatzhalterMail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (PLATZHALTER_MAIL.test(e)) return true;
  // Generische Beispiel-Domains, unabhaengig vom lokalen Teil.
  return /@(example|beispiel|domain|muster|test|localhost)\.(com|de|org|net|invalid)$/i.test(e);
}

/**
 * Prueft, ob E-Mail-Domain und Firmen-Website zusammenpassen.
 * Gibt einen Grund zurueck, wenn sie es NICHT tun — sonst null.
 * Ohne eine der beiden Angaben wird nichts beanstandet (kein Fehlalarm bei
 * fehlender Information).
 */
export function mailPasstNichtZurWebsite(
  email: string | null | undefined,
  website: string | null | undefined,
): string | null {
  const mail = baseDomain(email);
  const site = baseDomain(website);
  if (!mail || !site) return null;
  if (mail === site) return null;
  // Freemail ist kein Widerspruch — viele Kleinbetriebe nutzen genau das.
  if (/^(gmail|googlemail|web|gmx|t-online|freenet|outlook|hotmail|yahoo|aol|posteo|mailbox)\./i.test(mail)) return null;
  return `Mail-Domain ${mail} passt nicht zur Website ${site}`;
}

// Domain aus URL oder E-Mail extrahieren, normalisiert (kein www, lowercase).
export function domainOf(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    if (raw.includes("@")) return raw.split("@")[1]?.replace(/^www\./, "") ?? null;
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return raw.replace(/^www\./, "").replace(/\/.*$/, "") || null;
  }
}

// Registrierbare Basis-Domain (letzte zwei Labels), damit jobs.firma.de und
// firma.de als gleich gelten. Bewusst simpel — kein Public-Suffix-List-Handling
// (mehrteilige TLDs wie .co.uk sind für DE-Handwerk irrelevant). TODO Phase 1b:
// PSL, falls .co.uk o.ä. auftauchen.
export function baseDomain(input: string | null | undefined): string | null {
  const d = domainOf(input);
  if (!d) return null;
  const parts = d.split(".");
  if (parts.length <= 2) return d;
  return parts.slice(-2).join(".");
}

// Blacklist-Treffer: Inserent-Name enthält einen Blacklist-Eintrag (beidseitig
// case-insensitiv, Teilstring — "Randstad Deutschland GmbH" matcht "Randstad").
function aufBlacklist(inserent: string | null, blacklist: string[]): string | null {
  if (!inserent) return null;
  const hay = inserent.toLowerCase();
  for (const name of blacklist) {
    if (name && hay.includes(name.toLowerCase())) return name;
  }
  return null;
}

// Kern-Filter. Gibt akzeptiert=false + Grund zurück, sobald ein Kriterium greift.
//
// firmaWebsite = website der Zielfirma (für den Domain-Abgleich).
// blacklist    = aktive Namen aus blacklist_inserenten (DB) — hier hereingereicht.
export function pruefeAnzeige(
  anzeige: RohAnzeige,
  opts: { firmaWebsite: string | null; blacklist: string[] }
): FilterErgebnis {
  // 1) Inserent auf Blacklist
  const treffer = aufBlacklist(anzeige.inserent, opts.blacklist);
  if (treffer) {
    return { akzeptiert: false, grund: `Blacklist-Inserent: ${treffer}` };
  }

  // 2) Störer-Keyword im Anzeigentext (oder Titel)
  const text = `${anzeige.stellentitel ?? ""} ${anzeige.raw_text ?? ""}`.toLowerCase();
  for (const kw of STOERER_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      return { akzeptiert: false, grund: `Störer-Keyword: ${kw}` };
    }
  }

  // 3) Bewerbungs-E-Mail-Domain ≠ Firmen-Website-Domain.
  //    Nur wenn BEIDE Domains vorhanden sind — sonst kein Verwurf
  //    (kein False-Positive bei fehlender Info).
  const mailDomain = baseDomain(anzeige.bewerbung_email);
  const siteDomain = baseDomain(opts.firmaWebsite);
  if (mailDomain && siteDomain && mailDomain !== siteDomain) {
    return {
      akzeptiert: false,
      grund: `Fremde Bewerbungs-Domain: ${mailDomain} ≠ ${siteDomain}`,
    };
  }

  return { akzeptiert: true, grund: null };
}
