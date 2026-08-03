// ─────────────────────────────────────────────────────────────────
// ERREICHBARKEIT — liest bei diesem Betrieb überhaupt jemand E-Mails?
//
// Das Problem, das diese Datei löst: Ein Dachdecker mit drei Mann, der den
// ganzen Tag auf dem Dach steht, liest seine info@-Adresse vielleicht einmal
// die Woche. Eine Kaltakquise-Mail dorthin ist verbrannt — egal wie gut sie
// geschrieben ist. Ein Produktionsbetrieb mit 60 Leuten und einem Büro hat
// dagegen jemanden, dessen Aufgabe genau das ist.
//
// Bewertet wird deshalb nicht "ist das ein guter Kunde", sondern schlichter:
// wie wahrscheinlich ist es, dass die Mail gelesen und weitergegeben wird.
// Reine Funktion, keine DB, keine API — nur die Felder, die ohnehin vorliegen.
// ─────────────────────────────────────────────────────────────────
import type { FirmaOutreach } from "@/types/stellensignale";

export interface ErreichbarkeitErgebnis {
  score: number;          // 0 bis ~12, höher = wahrscheinlicher gelesen
  gruende: string[];      // nachvollziehbar, warum der Wert so ist
}

/** Adressen, hinter denen jemand sitzt, dessen Job das Lesen IST. */
const POSTFACH_PERSONAL = /^(bewerbung|bewerbungen|personal|hr|karriere|jobs?|recruiting|ausbildung)\b/i;
/** Allgemeines Firmenpostfach: es gibt ein Büro, aber niemand ist zuständig. */
const POSTFACH_ALLGEMEIN = /^(info|kontakt|contact|office|mail|service|zentrale|empfang|sekretariat|verwaltung|buero|büro)\b/i;
/** Rechtsformen, die auf eine Organisation mit Verwaltung hindeuten. */
const RECHTSFORM = /\b(gmbh|mbh|kg|ohg|ag|se|e\.?\s?k\.?|gbr)\b/i;

export function erreichbarkeit(f: FirmaOutreach): ErreichbarkeitErgebnis {
  const gruende: string[] = [];
  let score = 0;

  // ── 1. Art der E-Mail-Adresse — das stärkste Einzelsignal ──
  const lokal = (f.email ?? "").split("@")[0] ?? "";
  if (POSTFACH_PERSONAL.test(lokal)) {
    score += 4;
    gruende.push(`Personal-/Bewerbungspostfach (${lokal}@) — dort ist Lesen die Aufgabe`);
  } else if (POSTFACH_ALLGEMEIN.test(lokal)) {
    score += 1;
    gruende.push(`allgemeines Postfach (${lokal}@) — Büro vorhanden, aber niemand zuständig`);
  } else if (lokal) {
    // Namensadresse wie t.brummund@ — eine konkrete Person, meist die Leitung.
    score += 3;
    gruende.push(`persönliche Adresse (${lokal}@)`);
  }

  // ── 2. Eigene Karriereseite ──
  // Wer eine pflegt, hat Recruiting als Prozess und nicht als Nebenbei-Aufgabe.
  if (f.website && f.email_quelle === "impressum") {
    score += 1;
    gruende.push("Website mit Impressum ausgewertet");
  }

  // ── 3. Mehrere offene Stellen ──
  // Ein Betrieb, der gleichzeitig mehrfach sucht, ist größer und hat fast immer
  // eine Verwaltung.
  if (f.anzahl_signale >= 3) {
    score += 3;
    gruende.push(`${f.anzahl_signale} offene Stellen — größere Organisation`);
  } else if (f.anzahl_signale === 2) {
    score += 1;
    gruende.push("2 offene Stellen");
  }

  // ── 4. Mitarbeiterzahl: bewusst NICHT bewertet ──
  // Wäre das stärkste Signal für "hat ein Büro", steht aber in zielfirmen und
  // nicht in der View v_firma_outreach, aus der diese Daten kommen. Die View
  // dafür neu zu schreiben wäre ein größerer Eingriff als der Nutzen
  // rechtfertigt — solange mitarbeiter_geschaetzt ohnehin fast überall leer ist,
  // weil keine Quelle sie liefert. Nachrüsten, sobald die Zahl verlässlich da ist.

  // ── 5. Rechtsform ──
  // Einzelunternehmen ohne Zusatz sind meist Kleinbetriebe; der Chef ist auf
  // der Baustelle und liest abends, wenn überhaupt.
  if (RECHTSFORM.test(f.firma)) {
    score += 1;
    gruende.push("Rechtsform im Namen — organisierter Betrieb");
  } else {
    score -= 1;
    gruende.push("keine Rechtsform im Namen — häufig Ein-Mann-/Kleinbetrieb");
  }

  // ── 6. E-Mail-Confidence ──
  // Geratene Adressen (Pattern statt Impressum) landen öfter im Nichts.
  if (f.email_confidence !== null && f.email_confidence < 60) {
    score -= 2;
    gruende.push(`Adresse nur geraten (Confidence ${f.email_confidence})`);
  }

  return { score: Math.max(0, score), gruende };
}

/**
 * Reihenfolge fürs Anschreiben: erst Erreichbarkeit, dann Dringlichkeit.
 *
 * Bewusst in dieser Reihenfolge. Eine seit einem halben Jahr offene Stelle
 * nützt nichts, wenn die Mail niemand liest — der heißeste Lead ist wertlos,
 * wenn er nicht ankommt.
 */
export function sortiereNachChance(firmen: FirmaOutreach[]): FirmaOutreach[] {
  return [...firmen].sort((a, b) => {
    const sa = erreichbarkeit(a).score;
    const sb = erreichbarkeit(b).score;
    if (sb !== sa) return sb - sa;
    if (a.ist_heiss !== b.ist_heiss) return a.ist_heiss ? -1 : 1;
    return b.wochen_offen - a.wochen_offen;
  });
}

/** Untergrenze, ab der ein Betrieb überhaupt angeschrieben wird. */
export function mindestScore(): number {
  return parseInt(process.env.STELLENSIGNALE_MIN_ERREICHBARKEIT ?? "3", 10);
}
