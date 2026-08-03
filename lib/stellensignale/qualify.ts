// ─────────────────────────────────────────────────────────────────
// Fachkraft-Qualifizierung für das STELLENSIGNAL-Modul.
// Reine Funktion — bestimmt aus Titel + Text, ob eine Anzeige eine
// Fachkraft/Geselle/Meister-Stelle ist (ist_fachkraft).
// ─────────────────────────────────────────────────────────────────
import { FACHKRAFT_POSITIV, FACHKRAFT_NEGATIV } from "@/lib/stellensignale/constants";
import type { RohAnzeige } from "@/types/stellensignale";

// true = Fachkraft-Stelle. Negativ-Signale (Helfer/Azubi/Praktikum) schlagen
// Positiv-Signale, damit "Ausbildung zum Elektroniker" NICHT als Fachkraft zählt.
export function istFachkraft(anzeige: Pick<RohAnzeige, "stellentitel" | "raw_text">): boolean {
  const haystack = `${anzeige.stellentitel ?? ""} ${anzeige.raw_text ?? ""}`;
  if (FACHKRAFT_NEGATIV.test(haystack)) return false;
  return FACHKRAFT_POSITIV.test(haystack);
}
