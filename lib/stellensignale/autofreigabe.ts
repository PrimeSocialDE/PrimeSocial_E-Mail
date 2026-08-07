// ─────────────────────────────────────────────────────────────────
// AUTOMATISCHE FREIGABE — damit der Versand nicht an einem Klick hängt.
//
// Bis hierher war Freigeben Handarbeit. Am 05.08. gingen zwei Mails raus, am
// 06.08. lagen 40 fertige Entwürfe bereit und es passierte einen ganzen Tag
// lang nichts — nicht weil etwas kaputt war, sondern weil niemand freigegeben
// hatte. Ein Versandsystem, das jeden Tag eine menschliche Handlung braucht,
// ist kein Versandsystem.
//
// SICHERHEIT. Automatisch freigegeben wird nur, was ALLE Prüfungen besteht:
//   • Adressqualität (adressqualitaet.ts) — fängt Platzhalter, Scraping-
//     Artefakte, Rechts- und Bewerberpostfächer ab
//   • kein eigener Kunde, keine gesperrte Adresse
//   • Firma auf 'aktiv' — wer geantwortet hat, steht auf 'cooldown'
//   • Adresse noch nie angeschrieben
//
// Der Schalter STELLENSIGNALE_AUTOFREIGABE steht standardmäßig auf AUS.
// Das ist Absicht: die automatische Freigabe entfernt die letzte menschliche
// Kontrolle vor einer Kaltakquise-Mail. Diese Entscheidung gehört dem
// Betreiber, nicht dem Code.
// ─────────────────────────────────────────────────────────────────
import { getClient, isSupabaseConfigured } from "@/lib/supabase";
import { getSuppressionSet, getBereitsAngeschrieben } from "@/lib/stellensignale/db";
import { adressQualitaet } from "@/lib/stellensignale/adressqualitaet";

export interface FreigabeResult {
  geprueft: number;
  freigegeben: number;
  abgelehnt: number;
  gruende: Record<string, number>;
  hinweis?: string;
}

/**
 * Füllt die Warteschlange freigegebener Erstansprachen auf.
 *
 * @param zielVorrat Wie viele freigegebene, noch nicht versendete
 *   Erstansprachen bereitstehen sollen. Sinnvoll ist etwas mehr als ein
 *   Tagesbudget, damit ein ausgefallener Lauf nichts reißt.
 */
export async function fuelleFreigabe(zielVorrat = 15): Promise<FreigabeResult> {
  const leer = (hinweis: string): FreigabeResult => ({
    geprueft: 0, freigegeben: 0, abgelehnt: 0, gruende: {}, hinweis,
  });

  if (!isSupabaseConfigured()) return leer("Supabase nicht konfiguriert");
  if (process.env.STELLENSIGNALE_AUTOFREIGABE !== "true") {
    return leer("STELLENSIGNALE_AUTOFREIGABE steht nicht auf 'true' — Freigabe bleibt Handarbeit");
  }

  const db = getClient();

  // Wie viel liegt schon bereit? Nur die Differenz nachfüllen — sonst wären
  // nach ein paar Läufen alle Entwürfe freigegeben und die Möglichkeit,
  // vorher hineinzuschauen, wäre weg.
  const { count: vorrat } = await db
    .from("stellen_entwuerfe")
    .select("id", { count: "exact", head: true })
    .eq("status", "freigegeben").eq("schritt", 1).is("gesendet_at", null);

  const fehlt = zielVorrat - (vorrat ?? 0);
  if (fehlt <= 0) {
    return { geprueft: 0, freigegeben: 0, abgelehnt: 0, gruende: {},
      hinweis: `Vorrat reicht (${vorrat} freigegeben, Ziel ${zielVorrat})` };
  }

  // Etwas mehr laden als gebraucht: ein Teil fällt durch die Prüfung.
  const { data, error } = await db
    .from("stellen_entwuerfe")
    .select("id, zielfirma_id, zielfirmen(firma, email, website, status)")
    .eq("status", "entwurf").eq("schritt", 1)
    .not("faellig_am", "is", null)
    .order("created_at", { ascending: true })
    .limit(fehlt * 3);
  if (error) throw error;

  const gesperrt = await getSuppressionSet();
  const schon = await getBereitsAngeschrieben();

  const gruende: Record<string, number> = {};
  let freigegeben = 0, abgelehnt = 0, geprueft = 0;

  for (const e of (data ?? []) as unknown as {
    id: string; zielfirma_id: string;
    zielfirmen?: { firma?: string; email?: string; website?: string; status?: string }
      | { firma?: string; email?: string; website?: string; status?: string }[] | null;
  }[]) {
    if (freigegeben >= fehlt) break;
    geprueft++;

    const rel = Array.isArray(e.zielfirmen) ? e.zielfirmen[0] : e.zielfirmen;
    const firma = rel?.firma ?? "";
    const mail = (rel?.email ?? "").toLowerCase().trim();

    const ablehnen = (grund: string) => {
      abgelehnt++;
      gruende[grund] = (gruende[grund] ?? 0) + 1;
    };

    if (rel?.status !== "aktiv") { ablehnen(`Firma steht auf '${rel?.status ?? "?"}'`); continue; }
    if (gesperrt.has(mail))      { ablehnen("Adresse gesperrt"); continue; }
    if (schon.has(mail))         { ablehnen("Adresse bereits angeschrieben"); continue; }

    const urteil = adressQualitaet(mail, firma, rel?.website);
    if (!urteil.ok) { ablehnen(urteil.grund ?? "Adressprüfung"); continue; }

    // Der zusaetzliche eq()-Filter ist ein Riegel gegen Wettläufe: liefe der
    // Cron doppelt, wuerde die zweite Aktualisierung ins Leere greifen statt
    // einen bereits versendeten Entwurf erneut freizugeben.
    const u = await db.from("stellen_entwuerfe")
      .update({ status: "freigegeben" })
      .eq("id", e.id).eq("status", "entwurf").eq("schritt", 1);
    if (u.error) { ablehnen(`Datenbank: ${u.error.message}`); continue; }
    freigegeben++;
  }

  return { geprueft, freigegeben, abgelehnt, gruende };
}
