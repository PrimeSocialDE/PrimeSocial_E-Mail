// ─────────────────────────────────────────────────────────────────
// ANTWORT- UND ABMELDE-ERKENNUNG für das STELLENSIGNAL-Modul.
//
// Zwei Aufgaben, die vor dem ersten Versand stehen müssen:
//
//   1. ABMELDUNGEN. Jede Mail trägt einen List-Unsubscribe-Header, der auf ein
//      Postfach zeigt. Wer dort "bitte keine Mails mehr" schreibt, MUSS
//      dauerhaft gesperrt werden — rechtlich wie auch für die SES-Reputation.
//      Bisher las dieses Postfach niemand.
//
//   2. ANTWORTEN. Wer geantwortet hat, darf nicht erneut automatisch
//      angeschrieben werden, und Niklas soll es mitbekommen.
//
// Reine Textauswertung, damit sie ohne IMAP testbar ist. Die Postfach-Anbindung
// liegt in der Cron-Route.
// ─────────────────────────────────────────────────────────────────

export type AntwortArt = "abmeldung" | "abwesenheit" | "unzustellbar" | "antwort";

/**
 * Klare Abmelde-Absicht. Bewusst eng gefasst: ein falsch erkanntes "abmelden"
 * sperrt einen Betrieb dauerhaft, und eine Sperre nimmt niemand zurück.
 * Im Zweifel lieber als normale Antwort behandeln — die landet ohnehin auf
 * dem Tisch eines Menschen.
 */
const ABMELDUNG = new RegExp(
  [
    "\\babmelden\\b", "\\babmeldung\\b", "\\bunsubscribe\\b", "\\bausgetragen\\b",
    "austragen", "keine\\s+(weiteren\\s+)?(e-?mails?|nachrichten|werbung)",
    "kein\\s+interesse\\s+.{0,30}(mehr|künftig|zukunft)",
    "aus\\s+(dem\\s+)?verteiler", "löschen\\s+sie\\s+.{0,20}(daten|adresse)",
    "widerspruch\\s+.{0,20}werbung", "bitte\\s+keine\\s+werbung",

    // TRENNBARE VERBEN — im Deutschen steht die Vorsilbe am Satzende, das
    // Verb selbst weit davor: "melden Sie uns bitte ab", "schreiben Sie uns
    // nicht mehr an". Ohne diese Muster rutschen die häufigsten Formulierungen
    // einer Abmeldung als harmlose Antwort durch.
    "melden\\s+sie\\s+(uns|mich)\\b[^.!?]{0,25}\\bab\\b",
    "tragen\\s+sie\\s+(uns|mich)\\b[^.!?]{0,25}\\baus\\b",
    "nicht\\s+mehr\\s+(an|anschreiben|kontaktieren|schreiben|melden|senden|schicken|zusenden)\\b",
    "schreiben\\s+sie\\s+(uns|mich)\\b[^.!?]{0,25}nicht\\s+mehr",
  ].join("|"),
  "i",
);

/** Automatische Abwesenheitsnotizen — keine echte Antwort eines Menschen. */
const ABWESENHEIT = new RegExp(
  [
    "abwesenheit", "out\\s+of\\s+office", "außer\\s+haus", "ausser\\s+haus",
    "urlaub bis", "im\\s+urlaub", "automatische\\s+antwort", "auto-?reply",
    "nicht\\s+im\\s+hause", "bin\\s+ab\\s+dem", "vertretung",
  ].join("|"),
  "i",
);

/** Zustellfehler, die als Mail zurückkommen statt als SES-Bounce. */
const UNZUSTELLBAR = new RegExp(
  [
    "unzustellbar", "undeliverable", "delivery\\s+status\\s+notification",
    "mail\\s+delivery\\s+failed", "returned\\s+mail", "postmaster",
    "550\\s", "recipient\\s+address\\s+rejected", "user\\s+unknown",
  ].join("|"),
  "i",
);

/**
 * Art einer eingehenden Mail bestimmen. Reihenfolge ist Absicht:
 * Unzustellbarkeit und Abwesenheit werden VOR der Abmeldung geprüft, weil
 * Abwesenheitsnotizen häufig Wörter wie "nicht mehr erreichbar" enthalten und
 * sonst fälschlich als Abmeldung durchgingen.
 */
export function bestimmeArt(betreff: string, text: string): AntwortArt {
  const beides = `${betreff}\n${text}`;
  if (UNZUSTELLBAR.test(beides)) return "unzustellbar";
  if (ABWESENHEIT.test(beides)) return "abwesenheit";
  if (ABMELDUNG.test(beides)) return "abmeldung";
  return "antwort";
}

/** Absenderadresse aus einem From-Header ziehen. */
export function adresseAus(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = header.match(/<([^>]+)>/) ?? header.match(/([\w.+-]+@[\w-]+\.\w+)/);
  return m ? m[1].toLowerCase().trim() : null;
}
