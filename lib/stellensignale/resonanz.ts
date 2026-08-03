// ─────────────────────────────────────────────────────────────────
// RESONANZ — was nach dem Versand passiert, und in welcher Nische.
//
// Bisher ging diese Information verloren: Der Antwort-Cron erkannte eine
// Antwort, setzte die Firma auf 'cooldown' und verwarf den Text. Damit liess
// sich weder nachlesen, wer geantwortet hat, noch auswerten, welches Gewerk
// ueberhaupt reagiert.
//
// ZUR OEFFNUNGSRATE. Sie steht hier bewusst NICHT im Mittelpunkt:
//
//   • Technisch. SES zaehlt Oeffnungen ueber ein 1x1-Pixel, das es in den
//     HTML-Teil einer Mail einbaut. Die Mails dieses Moduls sind reiner Text
//     (siehe lib/ses.ts) — es gibt keinen HTML-Teil, also kein Pixel und
//     keine Zahl. Das ist kein Versehen: der Textcharakter ist der Grund,
//     warum die Mails wie eine persoenliche Nachricht wirken.
//
//   • Rechtlich. Ein Zaehlpixel ist in Deutschland ohne Einwilligung des
//     Empfaengers heikel. Bei Kaltakquise, die ohnehin an § 7 UWG entlang
//     laeuft, ist das ein zusaetzliches Risiko ohne Gegenwert.
//
//   • Aussagekraft. Apple Mail laedt seit iOS 15 alle Bilder vorab. Jede so
//     zugestellte Mail meldet eine Oeffnung, die nie stattfand. Gmail
//     proxyt Bilder ebenfalls. Eine Oeffnungsrate ist damit zu einem
//     erheblichen Teil Rauschen.
//
// Die Ereignisarten 'geoeffnet' und 'geklickt' werden trotzdem verarbeitet,
// falls im Configuration Set einmal Open-Tracking aktiviert wird. Sie fliessen
// aber NICHT in die Bewertung einer Nische ein — dafuer zaehlen Antworten.
// ─────────────────────────────────────────────────────────────────
import { getClient, isSupabaseConfigured } from "@/lib/supabase";

export type EreignisArt =
  | "gesendet" | "zugestellt" | "geoeffnet" | "geklickt"
  | "antwort" | "abmeldung" | "unzustellbar" | "bounce" | "complaint";

export interface NeuesEreignis {
  zielfirma_id: string;
  entwurf_id?: string | null;
  schritt?: number | null;
  art: EreignisArt;
  gewerk?: string | null;
  betreff?: string | null;
  text?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface Ereignis extends NeuesEreignis {
  id: string;
  zeitpunkt: string;
}

/** Antwort samt Firma — das, was im Dashboard gelesen werden soll. */
export interface AntwortZeile {
  id: string;
  zeitpunkt: string;
  firma: string;
  gewerk: string | null;
  schritt: number | null;
  betreff: string | null;
  text: string | null;
}

export interface NischenZeile {
  gewerk: string;
  versendet: number;
  zugestellt: number;
  geoeffnet: number;
  antworten: number;
  abmeldungen: number;
  unzustellbar: number;
  /** Antworten je 100 versendeter Mails. null, solange nichts versendet wurde. */
  antwortquote: number | null;
  /** Abmeldungen + Beschwerden je 100 — das Warnsignal. */
  aergerquote: number | null;
  /**
   * Ob die Zahl belastbar ist. Bei 3 versendeten Mails und 1 Antwort steht
   * da sonst "33 %", und das liest sich wie ein Befund, obwohl es Zufall ist.
   */
  aussagekraeftig: boolean;
}

/** Ab dieser Zahl versendeter Mails je Gewerk wird eine Quote gezeigt. */
export const MINDESTMENGE_NISCHE = 20;

function configured(): boolean { return isSupabaseConfigured(); }
function db() { return getClient(); }

/**
 * Ereignis festhalten.
 *
 * Wirft NICHT. Aufrufer sind Versand und Webhooks — dort darf ein Fehler in
 * der Protokollierung niemals den eigentlichen Vorgang abbrechen. Eine
 * fehlende Statistikzeile ist aergerlich, eine abgebrochene Sperrung nach
 * einer Beschwerde waere ein echter Schaden.
 *
 * Rueckgabe: true, wenn geschrieben wurde. false bei Duplikat oder Fehler.
 */
export async function protokolliere(e: NeuesEreignis): Promise<boolean> {
  if (!configured()) return false;
  try {
    const { error } = await db().from("stellen_ereignisse").insert({
      zielfirma_id: e.zielfirma_id,
      entwurf_id: e.entwurf_id ?? null,
      schritt: e.schritt ?? null,
      art: e.art,
      gewerk: e.gewerk ?? null,
      betreff: e.betreff?.slice(0, 300) ?? null,
      // Antworten koennen ganze Verlaeufe mitschleppen. 4000 Zeichen reichen,
      // um zu erkennen, worum es geht.
      text: e.text?.slice(0, 4000) ?? null,
      meta: e.meta ?? null,
    });
    if (error) {
      // 23505 = unique_violation. SNS stellt Nachrichten mindestens einmal zu,
      // Doppel sind also normal und kein Fehler.
      if (error.code === "23505") return false;
      console.warn(`[resonanz] ${e.art} nicht protokolliert:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[resonanz] Protokollierung fehlgeschlagen:", err);
    return false;
  }
}

/**
 * Auswertung je Gewerk.
 *
 * @param tage Zeitfenster. 0 oder undefiniert = alles.
 */
export async function nischenStatistik(tage?: number): Promise<NischenZeile[]> {
  if (!configured()) return [];

  let q = db().from("stellen_ereignisse").select("art, gewerk");
  if (tage && tage > 0) {
    q = q.gte("zeitpunkt", new Date(Date.now() - tage * 86_400_000).toISOString());
  }
  const { data, error } = await q;
  if (error) throw error;

  const zeilen = new Map<string, NischenZeile>();
  const leer = (gewerk: string): NischenZeile => ({
    gewerk, versendet: 0, zugestellt: 0, geoeffnet: 0, antworten: 0,
    abmeldungen: 0, unzustellbar: 0, antwortquote: null, aergerquote: null,
    aussagekraeftig: false,
  });

  for (const r of (data ?? []) as { art: EreignisArt; gewerk: string | null }[]) {
    // Firmen ohne Branchen-Zuordnung sind eine eigene Gruppe, keine Fussnote:
    // unter ihnen stecken die Betriebe, deren Name nichts verraet.
    const key = r.gewerk ?? "ohne Zuordnung";
    const z = zeilen.get(key) ?? leer(key);
    switch (r.art) {
      case "gesendet":     z.versendet++;    break;
      case "zugestellt":   z.zugestellt++;   break;
      case "geoeffnet":    z.geoeffnet++;    break;
      case "antwort":      z.antworten++;    break;
      case "abmeldung":    z.abmeldungen++;  break;
      case "complaint":    z.abmeldungen++;  break;
      case "unzustellbar": z.unzustellbar++; break;
      case "bounce":       z.unzustellbar++; break;
    }
    zeilen.set(key, z);
  }

  const out = [...zeilen.values()];
  for (const z of out) {
    if (z.versendet > 0) {
      z.antwortquote = (z.antworten / z.versendet) * 100;
      z.aergerquote = (z.abmeldungen / z.versendet) * 100;
    }
    z.aussagekraeftig = z.versendet >= MINDESTMENGE_NISCHE;
  }

  // Belastbare Nischen zuerst, darunter nach Antwortquote. Eine Nische mit
  // 2 von 3 sortiert sich damit NICHT an die Spitze.
  return out.sort((a, b) => {
    if (a.aussagekraeftig !== b.aussagekraeftig) return a.aussagekraeftig ? -1 : 1;
    if (a.aussagekraeftig) return (b.antwortquote ?? 0) - (a.antwortquote ?? 0);
    return b.versendet - a.versendet;
  });
}

/**
 * Das Gewerk, das beim Versand DIESER Mail galt.
 *
 * Spaetere Ereignisse (zugestellt, geoeffnet, Bounce) sollen derselben Nische
 * zugerechnet werden wie der Versand — auch wenn die Firma inzwischen anders
 * eingeordnet wurde. Sonst zaehlt eine Mail im Versand zu "metall" und ihre
 * Zustellung zu "industrie", und keine Quote ergibt mehr Sinn.
 */
export async function gewerkAusVersand(entwurfId: string): Promise<string | null> {
  if (!configured()) return null;
  const { data, error } = await db()
    .from("stellen_ereignisse")
    .select("gewerk")
    .eq("entwurf_id", entwurfId)
    .eq("art", "gesendet")
    .limit(1);
  if (error || !data?.length) return null;
  return (data[0].gewerk as string | null) ?? null;
}

/**
 * Die zuletzt versendete Mail einer Firma.
 *
 * Eine eingehende Antwort traegt keinen Hinweis darauf, auf welche der drei
 * Mails sie sich bezieht — Betreffzeilen werden zitiert, umformuliert oder
 * ganz ersetzt. Die zuletzt versendete ist die einzige belastbare Annahme.
 * Sie kann falsch sein, wenn jemand nach Wochen auf Mail 1 antwortet; fuer
 * die Frage "welcher Schritt loest Reaktionen aus" ist sie nah genug.
 */
export async function letzteGesendeteMail(
  zielfirmaId: string,
): Promise<{ id: string; schritt: number } | null> {
  if (!configured()) return null;
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("id, schritt")
    .eq("zielfirma_id", zielfirmaId)
    .not("gesendet_at", "is", null)
    .order("gesendet_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return { id: data[0].id as string, schritt: data[0].schritt as number };
}

/** Die letzten Antworten, zum Lesen. */
export async function letzteAntworten(limit = 30): Promise<AntwortZeile[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("stellen_ereignisse")
    .select("id, zeitpunkt, gewerk, schritt, betreff, text, zielfirmen(firma)")
    .eq("art", "antwort")
    .order("zeitpunkt", { ascending: false })
    .limit(limit);
  if (error) throw error;

  type Zeile = {
    id: string; zeitpunkt: string; gewerk: string | null; schritt: number | null;
    betreff: string | null; text: string | null;
    // Supabase liefert die Relation je nach Beziehung als Objekt ODER als Array.
    zielfirmen?: { firma?: string } | { firma?: string }[] | null;
  };

  return ((data ?? []) as unknown as Zeile[]).map((r) => {
    const rel = Array.isArray(r.zielfirmen) ? r.zielfirmen[0] : r.zielfirmen;
    return {
      id: r.id, zeitpunkt: r.zeitpunkt, firma: rel?.firma ?? "unbekannt",
      gewerk: r.gewerk, schritt: r.schritt, betreff: r.betreff, text: r.text,
    };
  });
}

/** Gesamtzahlen ueber alle Nischen — die Kopfzeile des Dashboards. */
export interface Gesamtbild {
  versendet: number;
  zugestellt: number;
  antworten: number;
  abmeldungen: number;
  unzustellbar: number;
  antwortquote: number | null;
  aergerquote: number | null;
  /**
   * Ab 0,1 % Beschwerden sperrt SES Konten, ab 5 % Bounces ebenfalls. Diese
   * Zahl ist die einzige im Dashboard, bei der eine Ueberschreitung sofortiges
   * Handeln erfordert.
   */
  warnung: string | null;
}

export async function gesamtbild(tage?: number): Promise<Gesamtbild> {
  const nischen = await nischenStatistik(tage);
  const g: Gesamtbild = {
    versendet: 0, zugestellt: 0, antworten: 0, abmeldungen: 0, unzustellbar: 0,
    antwortquote: null, aergerquote: null, warnung: null,
  };
  for (const n of nischen) {
    g.versendet += n.versendet;
    g.zugestellt += n.zugestellt;
    g.antworten += n.antworten;
    g.abmeldungen += n.abmeldungen;
    g.unzustellbar += n.unzustellbar;
  }
  if (g.versendet > 0) {
    g.antwortquote = (g.antworten / g.versendet) * 100;
    g.aergerquote = (g.abmeldungen / g.versendet) * 100;

    // Erst ab einer Grundmenge warnen. Bei 5 versendeten Mails ist eine
    // einzelne Beschwerde rechnerisch 20 % — das waere ein Fehlalarm.
    if (g.versendet >= 50) {
      const bounceQuote = (g.unzustellbar / g.versendet) * 100;
      if (g.aergerquote >= 0.1) {
        g.warnung = `Beschwerdequote ${g.aergerquote.toFixed(2)} % — SES sperrt Konten ab 0,1 %. Versand anhalten und Liste pruefen.`;
      } else if (bounceQuote >= 5) {
        g.warnung = `Bounce-Quote ${bounceQuote.toFixed(1)} % — SES sperrt Konten ab 5 %. Adressqualitaet pruefen.`;
      }
    }
  }
  return g;
}
