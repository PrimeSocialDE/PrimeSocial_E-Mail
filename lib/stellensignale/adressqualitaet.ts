// ─────────────────────────────────────────────────────────────────
// ADRESSQUALITÄT — was von Hand geprüft wurde, als Code.
//
// Am 06.08. lagen 40 fertige Entwürfe zur Freigabe bereit. Sieben davon
// hätten Schaden angerichtet: eine Platzhalteradresse (beispiel@gmx.de), ein
// Sentry-Hash von Wix statt einer Mailbox, zwei durch %20 verstümmelte
// Adressen, zwei Rechtspostfächer (impressum@) und ein Bewerberpostfach.
// Eine achte, timo.gestaltung@otte-metallbau.de, rutschte durch — und war
// tags darauf der erste Hard Bounce.
//
// Diese Prüfung fängt genau diese Fälle ab. Sie ist die Voraussetzung dafür,
// dass Entwürfe ohne Menschen freigegeben werden dürfen: eine automatische
// Freigabe ist nur so gut wie das, was sie aussortiert.
//
// GRUNDSATZ: Im Zweifel ablehnen. Eine nicht verschickte Mail kostet einen
// Kontakt. Eine an eine tote Adresse verschickte Mail kostet Zustellbarkeit —
// und ab 5 % Bounce-Quote prüft AWS das Konto.
// ─────────────────────────────────────────────────────────────────
import { istEigenerKunde, istPlatzhalterMail } from "@/lib/stellensignale/filter";

export interface Urteil {
  ok: boolean;
  grund?: string;
}

/**
 * Sammelpostfächer, die es fast immer wirklich gibt. Sie sind keine
 * persönliche Ansprache, aber sie kommen an — und dafür gibt es die
 * Gatekeeper-Variante der Mail.
 */
const SAMMELPOSTFACH =
  /^(info|kontakt|contact|office|mail|e?-?mail|buero|büro|zentrale|firma|service|anfrage|verwaltung|empfang|willkommen|hallo|moin)\b/i;

/**
 * Postfächer, die zwar existieren, aber den Falschen erreichen.
 *
 * impressum@ und datenschutz@ sind Pflichtangaben-Postfächer — dort sitzt ein
 * Anwalt oder niemand. bewerbung@ ist das Bewerberpostfach: eine Vertriebsmail
 * dorthin wirkt, als hätten wir nicht gelesen, was wir anschreiben.
 */
const FALSCHER_EMPFAENGER =
  /^(impressum|datenschutz|dsgvo|webmaster|postmaster|hostmaster|abuse|noreply|no-reply|donotreply|mailer-daemon|bounce|bewerbung|bewerbungen|jobs|karriere|career|application|presse|press|marketing|newsletter|spam)\b/i;

/**
 * Vorname + Sachwort statt Nachname: "timo.gestaltung", "f.keramik".
 *
 * Das entsteht, wenn der Scraper zwei Textfragmente einer Seite zusammenzieht.
 * Solche Adressen sehen persönlich aus und sind es nie — die erste dieser Art
 * war prompt der erste Bounce.
 */
const VORNAME_SACHWORT =
  /^[a-zäöüß]+[._-](gestaltung|keramik|design|technik|montage|planung|bau|service|verkauf|handel|shop|team|web|foto|grafik|druck|logistik|lager)$/i;

/** Freemail-Anbieter. Bei kleinen Handwerksbetrieben völlig normal. */
const FREEMAIL = /^(t-online\.de|gmx\.(de|net|at|ch)|web\.de|gmail\.com|googlemail\.com|outlook\.(de|com)|hotmail\.(de|com)|yahoo\.\w+|freenet\.de|aol\.com)$/i;

/**
 * Taugt diese Adresse für einen automatischen Versand?
 *
 * @param email    Empfängeradresse
 * @param firma    Firmenname — für den Kundenabgleich
 * @param website  bekannte Website, für den Domainabgleich (optional)
 */
export function adressQualitaet(
  email: string | null | undefined,
  firma: string,
  website?: string | null,
): Urteil {
  const mail = (email ?? "").trim().toLowerCase();
  if (!mail) return { ok: false, grund: "keine Adresse" };

  // Eigene Kunden zuerst — der teuerste denkbare Fehler ist eine
  // Kaltakquise-Mail an einen bestehenden Kunden.
  if (istEigenerKunde(firma)) return { ok: false, grund: "eigener Kunde oder Referenz" };

  // Grundform. Bewusst streng: ein Zeichen daneben und SES bouncet.
  if (!/^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(mail)) {
    return { ok: false, grund: "keine gültige Adressform" };
  }

  const [lokal, domain] = mail.split("@");

  if (istPlatzhalterMail(mail)) return { ok: false, grund: "Platzhalter-Adresse" };
  if (/^(beispiel|example|muster|test|demo|dummy|vorname|nachname|name|ihre?|your)\b/i.test(lokal)) {
    return { ok: false, grund: `Platzhalter "${lokal}"` };
  }

  // Reine Hex-Ketten sind Tracking- oder Fehlerdienst-Adressen, keine
  // Postfächer. Der Fall war ein Sentry-Hash aus einer Wix-Seite.
  if (/^[0-9a-f]{16,}$/i.test(lokal)) return { ok: false, grund: "Hash statt Postfach (Scraping-Artefakt)" };
  if (/sentry|wixpress|sentry-next|bugsnag|rollbar/i.test(domain)) {
    return { ok: false, grund: `Fehlerdienst-Domain "${domain}"` };
  }

  // URL-Kodierung, die beim Scrapen stehen geblieben ist: %20 wird zu "20info".
  if (/^(20|22|3d|2f|0a|0d)(info|kontakt|mail|office|buero|service)/i.test(lokal)) {
    return { ok: false, grund: `URL-Artefakt am Anfang ("${lokal}")` };
  }
  if (/^(mailto|href|http|www)/i.test(lokal)) return { ok: false, grund: `Scraping-Artefakt "${lokal}"` };

  if (FALSCHER_EMPFAENGER.test(lokal)) return { ok: false, grund: `"${lokal}@" erreicht den Falschen` };
  if (VORNAME_SACHWORT.test(lokal)) return { ok: false, grund: `"${lokal}" sieht nach zusammengesetztem Text aus, nicht nach Postfach` };

  // Sehr kurze lokale Teile sind meist Initialen ("tb@") und völlig echt —
  // aber ein einzelnes Zeichen ist fast immer ein Scraping-Rest.
  if (lokal.length < 2) return { ok: false, grund: "lokaler Teil zu kurz" };

  // Eine von der Website abweichende Mail-Domain ist AUSDRUECKLICH KEIN
  // Ausschlussgrund. MOIN SOLAR GmbH firmiert unter moin-solar.de und nutzt
  // hallo@wilkensolar.de — beides gehoert zusammen, die Mail kam dort an.
  // Ein Betrieb, der seine Mail bei einer Schwesterfirma, einem alten
  // Domainnamen oder dem Steuerberater liegen hat, ist der Normalfall im
  // Mittelstand, kein Fehler. Wer hier sperrt, verliert genau die Betriebe,
  // die man haben will. Die Abweichung ist in erreichbarkeit.ts ein
  // Punktabzug — das ist die richtige Schaerfe dafuer.

  return { ok: true };
}

/** Ist das ein Sammelpostfach? Entscheidet über Gatekeeper- oder Direktansprache. */
export function istSammelpostfach(email: string | null | undefined): boolean {
  const lokal = (email ?? "").toLowerCase().split("@")[0] ?? "";
  return SAMMELPOSTFACH.test(lokal);
}
