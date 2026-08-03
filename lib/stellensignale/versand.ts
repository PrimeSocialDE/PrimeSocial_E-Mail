/**
 * versand.ts — verschickt FREIGEGEBENE Stellensignal-Entwürfe über SES.
 *
 * Sicherheitsnetze, absichtlich mehrfach gestaffelt:
 *   1. Kill-Switch STELLENSIGNALE_VERSAND_ENABLED (Default AUS).
 *   2. Nur Entwürfe mit status='freigegeben' — nichts geht ohne Freigabe raus.
 *   3. Sendefenster Mo-Fr, 8-17 Uhr deutscher Zeit.
 *   4. Warmup-Rampe: eine frische Domain darf nicht bei 50/Tag starten.
 *   5. Tagesbudget, über den Tag verteilt statt in einem Schwung.
 *   6. Suppression-Prüfung vor JEDEM einzelnen Versand.
 */
import {
  getVersandbereiteEntwuerfe,
  getHeuteGesendet,
  getSuppressionSet,
  getBereitsAngeschrieben,
  markEntwurfGesendet,
  markEntwurfFehler,
  terminiereNaechstenSchritt,
} from "@/lib/stellensignale/db";
import { sendSesMail, isSesConfigured } from "@/lib/ses";
import { protokolliere } from "@/lib/stellensignale/resonanz";

export interface VersandResult {
  gesendet: number;
  /** Aufschluesselung nach Sequenz-Schritt: wie viele Erstansprachen, Nachfass-, Abschlussmails. */
  proSchritt: Record<number, number>;
  uebersprungen: number;
  fehler: string[];
  budget: number;
  heuteBereits: number;
  hinweis?: string;
}

/**
 * Wie viele Mails darf die Domain heute maximal verschicken?
 *
 * Ohne Warmup landet eine neue Domain bei 50 Mails/Tag zuverlässig im Spam
 * oder führt zur SES-Sperre. Die Rampe verdoppelt wöchentlich ab 5/Tag, ist
 * also nach gut vier Wochen bei 50. SES_WARMUP_START ist das Startdatum
 * (YYYY-MM-DD); ohne die Variable gilt sofort das volle Limit.
 */
export function tagesbudget(jetzt = new Date()): { budget: number; stufe: string } {
  const max = parseInt(process.env.STELLENSIGNALE_MAX_MAILS_PRO_TAG ?? "30", 10);
  const start = process.env.SES_WARMUP_START;
  if (!start) return { budget: max, stufe: "kein Warmup konfiguriert" };

  const startMs = Date.parse(`${start}T00:00:00Z`);
  if (Number.isNaN(startMs)) return { budget: max, stufe: `SES_WARMUP_START unlesbar (${start})` };

  const tage = Math.floor((jetzt.getTime() - startMs) / 86_400_000);
  if (tage < 0) return { budget: 0, stufe: "Warmup startet erst später" };

  // Startmenge einstellbar. 5 ist der vorsichtige Standard; 10 ist vertretbar,
  // wenn SPF, DKIM und DMARC sauber sind und die Bounce-Verarbeitung laeuft —
  // beides hier der Fall. Hoeher waere Leichtsinn: die Bounce-Quote der
  // gescrapten Adressen kennt niemand, bevor die ersten Mails raus sind.
  const startMenge = Math.min(20, Math.max(1, parseInt(process.env.SES_WARMUP_START_MENGE ?? "5", 10)));
  const woche = Math.floor(tage / 7);
  const rampe = startMenge * Math.pow(2, woche);
  const budget = Math.min(rampe, max);
  return { budget, stufe: `Warmup-Woche ${woche + 1}: ${rampe}/Tag, Deckel ${max}` };
}

/** Sendefenster: Mo-Fr, 8:00-17:00 deutscher Zeit (sommerzeitsicher). */
export function imSendefenster(jetzt = new Date()): { ok: boolean; grund?: string } {
  const wochentag = jetzt.toLocaleString("en-US", { timeZone: "Europe/Berlin", weekday: "short" });
  if (wochentag === "Sat" || wochentag === "Sun") {
    return { ok: false, grund: `Wochenende (${wochentag})` };
  }
  const stunde = parseInt(
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hour12: false })
      .format(jetzt),
    10,
  );
  if (stunde < 8 || stunde >= 17) {
    return { ok: false, grund: `außerhalb 8-17 Uhr (aktuell ${stunde}:00)` };
  }
  return { ok: true };
}

export async function sendeFreigegebene(opts?: { jetzt?: Date; ignoriereFenster?: boolean }): Promise<VersandResult> {
  const jetzt = opts?.jetzt ?? new Date();
  const leer = (hinweis: string): VersandResult => ({
    gesendet: 0, proSchritt: {}, uebersprungen: 0, fehler: [], budget: 0, heuteBereits: 0, hinweis,
  });

  if (process.env.STELLENSIGNALE_VERSAND_ENABLED !== "true") {
    return leer("STELLENSIGNALE_VERSAND_ENABLED ist nicht 'true' — kein Versand");
  }
  if (!isSesConfigured()) {
    return leer("SES nicht konfiguriert (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / SES_FROM_EMAIL)");
  }
  // RIEGEL: ohne Configuration Set kein Versand.
  //
  // SES sendet auch ohne Configuration Set klaglos weiter — meldet dann aber
  // KEINE Bounces und KEINE Beschwerden zurueck. Der Versand sieht normal aus,
  // die Suppression-Liste bleibt leer, tote Adressen werden erneut angeschrieben
  // und die Bounce-Quote steigt unbemerkt, bis AWS das Konto sperrt.
  //
  // Das ist der gefaehrlichste Zustand des ganzen Moduls: alles wirkt in
  // Ordnung, waehrend die Domain verbrennt. Deshalb lieber gar nicht senden.
  if (!process.env.SES_CONFIGURATION_SET) {
    return leer(
      "SES_CONFIGURATION_SET fehlt — ohne Configuration Set meldet SES weder " +
      "Bounces noch Beschwerden zurueck. Versand aus Sicherheitsgruenden gestoppt.",
    );
  }
  if (!opts?.ignoriereFenster) {
    const fenster = imSendefenster(jetzt);
    if (!fenster.ok) return leer(`Sendefenster geschlossen: ${fenster.grund}`);
  }

  const { budget, stufe } = tagesbudget(jetzt);
  const heuteBereits = await getHeuteGesendet();
  const rest = budget - heuteBereits;
  if (rest <= 0) {
    return { gesendet: 0, proSchritt: {}, uebersprungen: 0, fehler: [], budget, heuteBereits, hinweis: `Tagesbudget erreicht (${stufe})` };
  }

  // Über den Tag verteilen statt alles in den ersten Lauf zu kippen: 18 Läufe
  // im Fenster (alle 30 Min), wir zielen auf gut ein Zwölftel je Lauf. Ein
  // Schwung von 50 Mails um Punkt 8:00 sieht für jeden Spamfilter nach Blast aus.
  const proLauf = Math.max(1, Math.min(rest, Math.ceil(budget / 12)));

  const kandidaten = await getVersandbereiteEntwuerfe(proLauf * 2); // Puffer für Suppression-Treffer
  const gesperrt = await getSuppressionSet();
  // Adressen, die schon einmal bedient wurden — schuetzt vor Doppelansprache,
  // wenn dieselbe Firma versehentlich zweimal in der Datenbank steht.
  const schonAngeschrieben = await getBereitsAngeschrieben();
  // Innerhalb DIESES Laufs ebenfalls mitzaehlen: zwei faellige Entwuerfe mit
  // derselben Adresse wuerden sonst beide rausgehen.
  const indiesemLauf = new Set<string>();

  let gesendet = 0;
  const proSchritt: Record<number, number> = {};
  let uebersprungen = 0;
  const fehler: string[] = [];

  for (const e of kandidaten) {
    if (gesendet >= proLauf) break;
    const email = (e.email ?? "").toLowerCase().trim();
    if (!email) { uebersprungen++; continue; }

    if (gesperrt.has(email)) {
      await markEntwurfFehler(e.id, "Adresse steht auf der Suppression-Liste", e.versuche ?? 0);
      uebersprungen++;
      continue;
    }

    // Doppelansprache verhindern — aber NUR bei Erstansprachen. Schritt 2 und 3
    // gehen bewusst an dieselbe Adresse, das ist ja der Sinn der Sequenz.
    if (e.schritt === 1 && (schonAngeschrieben.has(email) || indiesemLauf.has(email))) {
      await markEntwurfFehler(e.id, "Adresse wurde bereits angeschrieben (Doppeleintrag?)", e.versuche ?? 0);
      uebersprungen++;
      continue;
    }

    try {
      const { messageId } = await sendSesMail({
        to: email,
        subject: e.betreff,
        bodyText: e.text,
      });
      await markEntwurfGesendet(e.id, { gesendet_an: email, ses_message_id: messageId });
      gesendet++;
      indiesemLauf.add(email);
      proSchritt[e.schritt] = (proSchritt[e.schritt] ?? 0) + 1;

      // Bezugsgroesse fuer jede spaetere Quote. Ohne diese Zeile laesst sich
      // eine Antwort keiner Menge gegenueberstellen — "3 Antworten" ist
      // wertlos, "3 von 40 im Metallbau" ist eine Aussage.
      await protokolliere({
        zielfirma_id: e.zielfirma_id, entwurf_id: e.id, schritt: e.schritt,
        art: "gesendet", gewerk: e.gewerk, betreff: e.betreff,
        meta: { ses_message_id: messageId },
      });

      // Erst jetzt den Folgeschritt terminieren — ab dem TATSAECHLICHEN Versand.
      // Schlaegt das fehl, ist die Mail trotzdem raus: nur protokollieren, nicht
      // den ganzen Lauf abbrechen.
      try {
        await terminiereNaechstenSchritt(e.zielfirma_id, e.schritt);
      } catch (err) {
        fehler.push(`${e.firma}: Folgeschritt nicht terminiert (${err instanceof Error ? err.message : err})`);
      }
    } catch (err) {
      const versuche = (e.versuche ?? 0) + 1;
      const msg = err instanceof Error ? err.message : String(err);
      await markEntwurfFehler(e.id, msg, versuche);
      fehler.push(`${e.firma}: ${msg}`);
    }
  }

  return { gesendet, proSchritt, uebersprungen, fehler, budget, heuteBereits, hinweis: stufe };
}
