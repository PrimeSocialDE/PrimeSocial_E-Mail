/**
 * Antwort- und Abmelde-Cron für das STELLENSIGNAL-Modul.
 *
 * Liest das Versand-Postfach und verarbeitet, was zurückkommt:
 *   • ABMELDUNG    → dauerhaft in stellen_suppression, Firma gesperrt
 *   • UNZUSTELLBAR → in stellen_suppression (Bounce, der als Mail zurückkam
 *                    statt über SES — passiert bei Weiterleitungen)
 *   • ANTWORT      → Firma auf 'cooldown', damit sie nicht erneut in einen
 *                    automatischen Lauf gerät. Ein Mensch schaut drauf.
 *   • ABWESENHEIT  → wird ignoriert, ist keine Reaktion eines Menschen
 *
 * Warum das vor dem ersten Versand stehen muss: Der List-Unsubscribe-Header
 * verspricht eine Abmeldemöglichkeit. Wenn dort niemand liest, ist das
 * Versprechen wertlos — rechtlich angreifbar, und die Leute klicken statt
 * dessen auf "Spam". Genau die Beschwerderate sperrt SES-Konten.
 *
 * Getrennt vom bestehenden imap-replies-Cron, weil das Stellensignal-Modul
 * bewusst nur seine eigenen Tabellen anfasst.
 */
import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getZielfirmen, updateZielfirma, addSuppression } from "@/lib/stellensignale/db";
import { bestimmeArt, adresseAus } from "@/lib/stellensignale/antworten";
import { protokolliere, letzteGesendeteMail } from "@/lib/stellensignale/resonanz";
import type { ZielfirmaStatus } from "@/types/stellensignale";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Eigene Zugangsdaten, damit das Versand-Postfach der Kaltakquise-Domain
  // getrennt vom Hauptpostfach bleibt. Fällt auf die bestehenden IMAP-Variablen
  // zurück, falls beides dasselbe Postfach ist.
  const host = process.env.STELLENSIGNALE_IMAP_HOST ?? process.env.IMAP_HOST;
  const user = process.env.STELLENSIGNALE_IMAP_USER ?? process.env.IMAP_USER;
  const pass = process.env.STELLENSIGNALE_IMAP_PASS ?? process.env.IMAP_PASS;
  const port = parseInt(process.env.STELLENSIGNALE_IMAP_PORT ?? process.env.IMAP_PORT ?? "993", 10);

  if (!host || !user || !pass) {
    return NextResponse.json({
      ok: true, skipped: true,
      reason: "IMAP-Zugang nicht gesetzt (STELLENSIGNALE_IMAP_HOST/USER/PASS)",
    });
  }

  const log: string[] = [];
  const ergebnis = { abmeldungen: 0, unzustellbar: 0, antworten: 0, abwesenheit: 0, ohneZuordnung: 0 };

  const client = new ImapFlow({
    host, port, secure: port === 993, auth: { user, pass }, logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Firmen-Index über die E-Mail-Adresse. Klein genug, um ihn einmal zu laden.
      const firmen = await getZielfirmen();
      const firmaByMail = new Map<string, { id: string; firma: string; status: string; gewerk: string | null }>();
      for (const f of firmen) {
        if (f.email) firmaByMail.set(f.email.toLowerCase(), { id: f.id, firma: f.firma, status: f.status, gewerk: f.gewerk ?? null });
      }

      const since = new Date(Date.now() - 30 * 86_400_000);
      const nachrichten = client.fetch({ seen: false, since }, { envelope: true, uid: true, bodyParts: ["text"] });

      const verarbeitet: number[] = [];
      let gesehen = 0;

      for await (const msg of nachrichten) {
        if (gesehen++ >= 200) break; // Deckel, damit der Cron in der Zeit bleibt

        const von = adresseAus(msg.envelope?.from?.[0]?.address ?? null);
        if (!von || von === user.toLowerCase()) continue;

        const betreff = msg.envelope?.subject ?? "";
        const rumpf = msg.bodyParts?.get("text")?.toString("utf8").slice(0, 4000) ?? "";
        const art = bestimmeArt(betreff, rumpf);

        const firma = firmaByMail.get(von);

        if (art === "abwesenheit") {
          ergebnis.abwesenheit++;
          verarbeitet.push(msg.uid);
          continue;
        }

        if (art === "abmeldung" || art === "unzustellbar") {
          // Adresse IMMER sperren, auch wenn wir die Firma nicht zuordnen können —
          // die Adresse ist das Entscheidende, nicht der Datenbankeintrag.
          await addSuppression({
            email: von,
            grund: art === "abmeldung" ? "opt_out" : "hard_bounce",
            quelle: "reply",
            detail: betreff.slice(0, 200),
          });
          if (art === "abmeldung") ergebnis.abmeldungen++; else ergebnis.unzustellbar++;

          if (firma) {
            await updateZielfirma(firma.id, { status: "gesperrt" as ZielfirmaStatus });
            const bezug = await letzteGesendeteMail(firma.id);
            await protokolliere({
              zielfirma_id: firma.id, entwurf_id: bezug?.id ?? null,
              schritt: bezug?.schritt ?? null, art, gewerk: firma.gewerk,
              betreff, meta: { von },
            });
            log.push(`${art}: ${firma.firma} (${von}) → gesperrt`);
          } else {
            ergebnis.ohneZuordnung++;
            log.push(`${art}: ${von} (keine Firma zugeordnet) → nur Adresse gesperrt`);
          }
          verarbeitet.push(msg.uid);
          continue;
        }

        // Echte Antwort eines Menschen.
        if (firma) {
          ergebnis.antworten++;
          // NICHT sperren: eine Antwort kann Interesse sein. 'cooldown' hält die
          // Firma nur aus automatischen Läufen heraus, bis jemand draufschaut.
          if (firma.status === "aktiv") {
            await updateZielfirma(firma.id, { status: "cooldown" as ZielfirmaStatus });
          }

          // Den WORTLAUT festhalten, nicht nur die Tatsache. Gleich darunter
          // wird die Mail im Postfach als gelesen markiert und geht damit in
          // der Ablage unter; ohne diese Zeile bliebe von der Antwort nichts
          // als ein Statuswechsel. Sie ist ausserdem die Grundlage der
          // Nischen-Auswertung.
          const bezug = await letzteGesendeteMail(firma.id);
          await protokolliere({
            zielfirma_id: firma.id, entwurf_id: bezug?.id ?? null,
            schritt: bezug?.schritt ?? null, art: "antwort",
            gewerk: firma.gewerk, betreff, text: rumpf, meta: { von },
          });

          log.push(`Antwort von ${firma.firma} (${von}) → cooldown, bitte ansehen`);
          verarbeitet.push(msg.uid);
        } else {
          ergebnis.ohneZuordnung++;
        }
      }

      // Nur verarbeitete Mails als gelesen markieren. Alles andere bleibt
      // ungelesen im Postfach — dort gehört es hin, nicht in einen Cron.
      if (verarbeitet.length > 0) {
        await client.messageFlagsAdd(verarbeitet, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[antworten-cron] Abbruch:", msg);
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 });
  } finally {
    await client.logout().catch(() => {});
  }

  return NextResponse.json({ ok: true, ...ergebnis, log: log.slice(0, 50) });
}

export async function POST(req: Request) {
  return GET(req);
}
