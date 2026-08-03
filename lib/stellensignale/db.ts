// ─────────────────────────────────────────────────────────────────
// Daten-Layer für das STELLENSIGNAL-Modul.
// Schreibt AUSSCHLIESSLICH zielfirmen / stellen_signale /
// blacklist_inserenten. Kein Zugriff auf primesocial_leads / research_* /
// manual_*. Nutzt denselben Supabase-Client wie der Rest (anon-key).
// ─────────────────────────────────────────────────────────────────
import { getClient, isSupabaseConfigured } from "@/lib/supabase";
import { BLACKLIST_INSERENTEN_SEED } from "@/lib/stellensignale/constants";
import { istAusgeschlossen } from "@/lib/stellensignale/filter";
import { erreichbarkeit, sortiereNachChance, mindestScore } from "@/lib/stellensignale/erreichbarkeit";
import type {
  Zielfirma,
  StellenSignal,
  StellenSignalView,
  BlacklistInserent,
  ZielfirmaStatus,
  FirmaOutreach,
  StellenEntwurf,
  StellenEntwurfMitFirma,
  EntwurfStatus,
} from "@/types/stellensignale";

function configured(): boolean {
  return isSupabaseConfigured();
}
function db() {
  return getClient();
}

// ─────────────── Zielfirmen ───────────────

// Firmen, die der Crawler bearbeitet (status='aktiv'). Optionales Limit für
// Batch-Läufe (Apify-Kostenkontrolle).
export async function getAktiveZielfirmen(limit?: number): Promise<Zielfirma[]> {
  if (!configured()) return [];
  let q = db()
    .from("zielfirmen")
    .select("*")
    .eq("status", "aktiv")
    .order("updated_at", { ascending: true }); // am längsten nicht gecrawlte zuerst
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Zielfirma[];
}

export async function getZielfirmen(filters?: { status?: ZielfirmaStatus }): Promise<Zielfirma[]> {
  if (!configured()) return [];
  let q = db().from("zielfirmen").select("*").order("firma", { ascending: true });
  if (filters?.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Zielfirma[];
}

export async function createZielfirma(
  firma: Omit<Zielfirma, "id" | "created_at" | "updated_at">
): Promise<Zielfirma> {
  const { data, error } = await db().from("zielfirmen").insert(firma).select().single();
  if (error) throw error;
  return data as Zielfirma;
}

export async function updateZielfirma(id: string, updates: Partial<Zielfirma>): Promise<void> {
  const { error } = await db().from("zielfirmen").update(updates).eq("id", id);
  if (error) throw error;
}

// Bereits vorhandene Firmen gegen die Ausschlussliste prüfen und auf
// status='gesperrt' setzen (Konzerne/Personaldienstleister aussortieren).
// Löscht nichts — die Firmen bleiben erhalten, werden nur nicht mehr bearbeitet.
export async function sperreAusgeschlosseneFirmen(): Promise<{
  geprueft: number;
  gesperrt: number;
  namen: string[];
}> {
  const result = { geprueft: 0, gesperrt: 0, namen: [] as string[] };
  if (!configured()) return result;
  const { data, error } = await db().from("zielfirmen").select("id, firma").eq("status", "aktiv");
  if (error) throw error;
  const firmen = (data ?? []) as { id: string; firma: string }[];
  result.geprueft = firmen.length;

  for (const f of firmen) {
    const grund = istAusgeschlossen(f.firma);
    if (!grund) continue;
    const { error: updErr } = await db()
      .from("zielfirmen")
      .update({ status: "gesperrt" as ZielfirmaStatus })
      .eq("id", f.id);
    if (updErr) continue;
    result.gesperrt++;
    if (result.namen.length < 50) result.namen.push(`${f.firma} (${grund})`);
  }
  return result;
}

// Mehrere Firmen auf einmal anlegen (CSV-Import). Reines INSERT — Dedup passiert
// im Aufrufer (Script), damit hier nichts überschrieben werden kann.
export async function createZielfirmenBulk(
  firmen: Omit<Zielfirma, "id" | "created_at" | "updated_at">[]
): Promise<number> {
  if (firmen.length === 0) return 0;
  const { data, error } = await db().from("zielfirmen").insert(firmen).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

// karriere_url nach der automatischen Ermittlung beim ersten Crawl speichern.
export async function setKarriereUrl(id: string, url: string): Promise<void> {
  await updateZielfirma(id, { karriere_url: url });
}

// Firmen ohne E-Mail, ABER mit Website — nur die können per Impressum
// angereichert werden. Ohne Website gibt es nichts zu scrapen → ausschließen,
// damit der gedeckelte Lauf nicht auf website-losen Firmen verpufft.
export async function getFirmenOhneEmail(limit?: number): Promise<Zielfirma[]> {
  if (!configured()) return [];
  let q = db()
    .from("zielfirmen")
    .select("*")
    .is("email", null)
    .not("website", "is", null)
    .neq("status", "gesperrt")
    // Nach updated_at, NICHT nach created_at: sonst bearbeitet jeder Lauf
    // dieselben aeltesten Firmen — genau die, die schon gescheitert sind — und
    // erreicht die neu hinzugekommenen nie. Nach einem erfolglosen Versuch
    // wird updated_at angefasst, dadurch rotiert die Warteschlange von selbst.
    .order("updated_at", { ascending: true });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Zielfirma[];
}

// ─────────────── Blacklist ───────────────

// Aktive Blacklist-Namen. Fällt auf den Code-Seed zurück, falls die Tabelle
// (noch) leer/nicht erreichbar ist — so filtert der Störer-Filter nie „nackt".
export async function getBlacklist(): Promise<string[]> {
  if (!configured()) return [...BLACKLIST_INSERENTEN_SEED];
  const { data, error } = await db()
    .from("blacklist_inserenten")
    .select("name")
    .eq("aktiv", true);
  if (error) throw error;
  const namen = (data ?? []).map((r: { name: string }) => r.name);
  return namen.length > 0 ? namen : [...BLACKLIST_INSERENTEN_SEED];
}

export async function getBlacklistEintraege(): Promise<BlacklistInserent[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("blacklist_inserenten")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BlacklistInserent[];
}

// ─────────────── Signale ───────────────

// Upsert eines gefundenen Signals. Bei Konflikt auf
// (zielfirma_id, stellentitel, quelle) wird die Stelle NICHT dupliziert,
// sondern letzter_fund (+ raw_text/ist_fachkraft) aktualisiert. erstfund
// bleibt durch ignoreDuplicates=false + gezielte Update-Felder erhalten.
export async function upsertSignal(input: {
  zielfirma_id: string;
  stellentitel: string;
  quelle: StellenSignal["quelle"];
  quelle_url: string | null;
  ist_fachkraft: boolean;
  raw_text: string | null;
  heute: string; // ISO-Date, vom Aufrufer gesetzt (Cron-Lauf-Datum)
}): Promise<void> {
  // Zwei-Schritt statt Upsert, um erstfund zu schützen: existiert die Zeile,
  // nur letzter_fund/raw_text/ist_fachkraft anfassen; sonst mit erstfund=heute
  // neu anlegen.
  const client = db();
  const { data: existing, error: selErr } = await client
    .from("stellen_signale")
    .select("id")
    .eq("zielfirma_id", input.zielfirma_id)
    .eq("stellentitel", input.stellentitel)
    .eq("quelle", input.quelle)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await client
      .from("stellen_signale")
      .update({
        letzter_fund: input.heute,
        raw_text: input.raw_text,
        ist_fachkraft: input.ist_fachkraft,
        quelle_url: input.quelle_url,
      })
      .eq("id", (existing as { id: string }).id);
    if (error) throw error;
  } else {
    const { error } = await client.from("stellen_signale").insert({
      zielfirma_id: input.zielfirma_id,
      stellentitel: input.stellentitel,
      quelle: input.quelle,
      quelle_url: input.quelle_url,
      ist_fachkraft: input.ist_fachkraft,
      raw_text: input.raw_text,
      erstfund: input.heute,
      letzter_fund: input.heute,
    });
    if (error) throw error;
  }
}

// Read-only Dashboard-Daten aus der View (inkl. wochen_offen / ist_heiss).
export async function getSignaleView(filters?: {
  nurHeiss?: boolean;
  gewerk?: string;
}): Promise<StellenSignalView[]> {
  if (!configured()) return [];
  let q = db()
    .from("v_stellen_signale")
    .select("*")
    .order("wochen_offen", { ascending: false });
  if (filters?.nurHeiss) q = q.eq("ist_heiss", true);
  if (filters?.gewerk) q = q.eq("gewerk", filters.gewerk);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StellenSignalView[];
}

// ─────────────── Outreach (eine Zeile pro Firma) ───────────────

// Übersicht: pro Firma die heißeste Stelle (v_firma_outreach). Heiß zuerst.
export async function getFirmaOutreach(): Promise<FirmaOutreach[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("v_firma_outreach")
    .select("*")
    .order("ist_heiss", { ascending: false })
    .order("wochen_offen", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FirmaOutreach[];
}

// Firmen, für die ein Entwurf erzeugt werden soll: heißeste Fachkraft-Stelle,
// E-Mail vorhanden, noch KEIN Entwurf. Gedeckelt.
export async function getFirmenFuerEntwurf(limit: number): Promise<FirmaOutreach[]> {
  if (!configured()) return [];
  // Nur GESPERRTE Entwürfe ausschließen (freigegeben/verworfen/gesendet).
  // Offene Entwürfe (Status "entwurf") dürfen neu geschrieben werden → Ton-Tuning.
  const { data: vorhandene } = await db().from("stellen_entwuerfe").select("zielfirma_id, status");
  const gesperrt = new Set(
    (vorhandene ?? [])
      .filter((r: { status: string }) => r.status !== "entwurf")
      .map((r: { zielfirma_id: string }) => r.zielfirma_id)
  );

  const { data, error } = await db()
    .from("v_firma_outreach")
    .select("*")
    .eq("ist_fachkraft", true)
    .not("email", "is", null)
    .order("ist_heiss", { ascending: false })
    .order("wochen_offen", { ascending: false });
  if (error) throw error;

  const offen = ((data ?? []) as FirmaOutreach[]).filter((f) => !gesperrt.has(f.zielfirma_id));

  // Vor dem Limit noch nach ERREICHBARKEIT sortieren und zu unwahrscheinliche
  // Betriebe aussortieren. Ohne diesen Schritt bekäme der Drei-Mann-Dachdecker,
  // der seine info@ einmal die Woche öffnet, genauso einen Claude-Aufruf wie der
  // Produktionsbetrieb mit Personalabteilung — bei gleichen Kosten und deutlich
  // schlechterer Aussicht.
  const min = mindestScore();
  const erreichbar = offen.filter((f) => erreichbarkeit(f).score >= min);
  return sortiereNachChance(erreichbar).slice(0, limit);
}

// ─────────────── Entwürfe ───────────────

export async function saveEntwurf(input: {
  zielfirma_id: string;
  signal_id: string | null;
  schritt: number;
  betreff: string;
  text: string;
  faellig_am: string | null;
}): Promise<void> {
  // Upsert auf (zielfirma_id, schritt) — seit der Sequenz-Migration gibt es
  // drei Entwuerfe je Firma. Ein erneuter Lauf ueberschreibt einen noch nicht
  // freigegebenen Entwurf, was beim Ton-Tuning gewollt ist.
  const { error } = await db()
    .from("stellen_entwuerfe")
    .upsert(
      { ...input, status: "entwurf" as EntwurfStatus },
      { onConflict: "zielfirma_id,schritt" }
    );
  if (error) throw error;
}

export async function updateEntwurfStatus(id: string, status: EntwurfStatus): Promise<void> {
  const { error } = await db().from("stellen_entwuerfe").update({ status }).eq("id", id);
  if (error) throw error;
}

/**
 * Status der GESAMTEN Sequenz einer Firma setzen (Freigabe-Modell A).
 *
 * Ein Klick gibt alle drei Schritte frei — bei 30 Mails am Tag waeren einzelne
 * Freigaben 90 Klicks. Bereits versendete Schritte bleiben unangetastet:
 * ein nachtraegliches "verworfen" darf eine Mail, die schon raus ist, nicht
 * umdeuten.
 *
 * Liefert zurueck, wie viele Schritte tatsaechlich geaendert wurden.
 */
export async function setzeSequenzStatus(
  zielfirmaId: string,
  status: EntwurfStatus,
): Promise<number> {
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .update({ status })
    .eq("zielfirma_id", zielfirmaId)
    .is("gesendet_at", null)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Zielfirma zu einem Entwurf ermitteln — die UI kennt nur die Entwurfs-ID. */
export async function getZielfirmaIdVonEntwurf(entwurfId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("stellen_entwuerfe").select("zielfirma_id").eq("id", entwurfId).maybeSingle();
  if (error) throw error;
  return (data as { zielfirma_id: string } | null)?.zielfirma_id ?? null;
}

// ─────────────── Versand ───────────────

// Freigegebene Entwürfe, die noch nicht raus sind — älteste zuerst, damit
// niemand ewig liegen bleibt. Firmen ohne E-Mail fallen raus.
export async function getVersandbereiteEntwuerfe(limit: number): Promise<StellenEntwurfMitFirma[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("*, zielfirmen(firma, ort, gewerk, email, email_confidence, gf_name, status)")
    .eq("status", "freigegeben")
    .is("gesendet_at", null)
    // Nur faellige Mails. Schritt 1 wird bei der Erstellung sofort faellig
    // gesetzt, 2 und 3 erst nach dem Versand der jeweiligen Vormail.
    .not("faellig_am", "is", null)
    .lte("faellig_am", new Date().toISOString())
    // Laufende Sequenzen zuerst: eine begonnene Ansprache abbrechen zu lassen,
    // weil das Tagesbudget von neuen Erstkontakten aufgebraucht wurde, waere
    // der schlechteste Ausgang. Hoher Schritt schlaegt niedrigen.
    .order("schritt", { ascending: false })
    .order("faellig_am", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as (StellenEntwurf & {
    zielfirmen?: { firma?: string; ort?: string | null; gewerk?: string | null; email?: string | null; email_confidence?: number | null; status?: string };
  })[])
    // Nur 'aktiv' anschreiben. Wer geantwortet hat, steht auf 'cooldown';
    // wer sich abgemeldet hat, auf 'gesperrt'. Beide fallen hier raus — damit
    // bricht die Sequenz automatisch ab, sobald jemand reagiert.
    .filter((r) => r.zielfirmen?.email && r.zielfirmen.status === "aktiv")
    .map((r) => ({
      ...r,
      firma: r.zielfirmen?.firma ?? "—",
      ort: r.zielfirmen?.ort ?? null,
      gewerk: r.zielfirmen?.gewerk ?? null,
      email: r.zielfirmen?.email ?? null,
      email_confidence: r.zielfirmen?.email_confidence ?? null,
      stellentitel: null,
    }));
}

/**
 * Mitternacht des laufenden Berliner Tages als UTC-ISO-String.
 * Der Offset darf NICHT fest verdrahtet werden: Berlin ist im Sommer UTC+2,
 * im Winter UTC+1. Mit einem festen Wert zählt die Tagesabfrage im Winter eine
 * Stunde des Vortags mit. Der Offset wird deshalb zur Laufzeit ermittelt.
 */
function berlinMitternachtIso(jetzt: Date): string {
  const datum = jetzt.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }); // YYYY-MM-DD
  // Wie viele Stunden liegt Berlin an diesem Tag vor UTC? Referenz ist 12:00 UTC,
  // damit die Rechnung nicht an einer Tagesgrenze kippt.
  const berlinUmUtcMittag = new Date(`${datum}T12:00:00Z`)
    .toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }); // "YYYY-MM-DD HH:mm:ss"
  const offsetStunden = Number(berlinUmUtcMittag.slice(11, 13)) - 12;
  return new Date(Date.parse(`${datum}T00:00:00Z`) - offsetStunden * 3_600_000).toISOString();
}

// Wie viele Mails sind heute (deutsche Zeit) schon raus? Basis fürs Tagesbudget.
export async function getHeuteGesendet(jetzt = new Date()): Promise<number> {
  if (!configured()) return 0;
  const { count, error } = await db()
    .from("stellen_entwuerfe")
    .select("id", { count: "exact", head: true })
    .gte("gesendet_at", berlinMitternachtIso(jetzt));
  if (error) throw error;
  return count ?? 0;
}

/**
 * Wie viele Entwürfe warten noch auf Freigabe bzw. Versand? Grundlage dafür,
 * die Entwurfs-Generierung am tatsächlichen Verbrauch auszurichten — sonst
 * schreibt Claude jeden Tag Mails, die nie rausgehen, und das kostet Tokens
 * ohne Gegenwert.
 */
export async function zaehleOffeneEntwuerfe(): Promise<{ entwurf: number; freigegeben: number }> {
  if (!configured()) return { entwurf: 0, freigegeben: 0 };
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("status")
    .in("status", ["entwurf", "freigegeben"])
    .is("gesendet_at", null);
  if (error) throw error;
  const zeilen = (data ?? []) as { status: string }[];
  return {
    entwurf: zeilen.filter((r) => r.status === "entwurf").length,
    freigegeben: zeilen.filter((r) => r.status === "freigegeben").length,
  };
}

/**
 * Naechsten Schritt der Sequenz terminieren — NACH dem Versand der Vormail.
 * Bewusst hier und nicht bei der Erstellung: laege der Termin schon fest,
 * verschoebe sich die ganze Sequenz, sobald eine Mail wegen des Tagesbudgets
 * einen Tag spaeter rausgeht.
 */
export async function terminiereNaechstenSchritt(
  zielfirmaId: string,
  geradeGesendeterSchritt: number,
): Promise<void> {
  const ABSTAND_TAGE: Record<number, number> = { 1: 4, 2: 3 };
  const tage = ABSTAND_TAGE[geradeGesendeterSchritt];
  if (!tage) return; // nach Schritt 3 ist die Sequenz zu Ende

  const { error } = await db()
    .from("stellen_entwuerfe")
    .update({ faellig_am: new Date(Date.now() + tage * 86_400_000).toISOString() })
    .eq("zielfirma_id", zielfirmaId)
    .eq("schritt", geradeGesendeterSchritt + 1)
    .is("gesendet_at", null);
  if (error) throw error;
}

/**
 * Alle Adressen, an die schon einmal etwas rausging.
 *
 * Zweite Verteidigungslinie gegen Doppelansprache: Der Dedup beim Anlegen
 * arbeitet ueber Firmenname und Domain und kann eine Firma trotzdem doppelt
 * erfassen — an echten Daten stehen neun Firmen zweimal drin. Zwei Zeilen mit
 * derselben Adresse ergaeben zwei Sequenzen an denselben Betrieb. Deshalb wird
 * VOR jedem Versand geprueft, ob diese ADRESSE schon bedient wurde, unabhaengig
 * davon, zu welcher Firmenzeile sie gehoert.
 */
export async function getBereitsAngeschrieben(): Promise<Set<string>> {
  if (!configured()) return new Set();
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("gesendet_an")
    .not("gesendet_an", "is", null);
  if (error) throw error;
  return new Set(
    ((data ?? []) as { gesendet_an: string | null }[])
      .map((r) => (r.gesendet_an ?? "").toLowerCase().trim())
      .filter(Boolean),
  );
}

export async function markEntwurfGesendet(
  id: string,
  input: { gesendet_an: string; ses_message_id: string },
): Promise<void> {
  const { error } = await db()
    .from("stellen_entwuerfe")
    .update({
      status: "gesendet" as EntwurfStatus,
      gesendet_at: new Date().toISOString(),
      gesendet_an: input.gesendet_an,
      ses_message_id: input.ses_message_id,
      fehler: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markEntwurfFehler(id: string, fehler: string, versuche: number): Promise<void> {
  const { error } = await db()
    .from("stellen_entwuerfe")
    .update({ fehler: fehler.slice(0, 500), versuche })
    .eq("id", id);
  if (error) throw error;
}

// ─────────────── Suppression ───────────────

// Adressen, die nie wieder angeschrieben werden dürfen. Wird vor JEDEM Versand
// geprüft — ein Verstoß kostet SES-Reputation und ist rechtlich heikel.
export async function getSuppressionSet(): Promise<Set<string>> {
  if (!configured()) return new Set();
  const { data, error } = await db().from("stellen_suppression").select("email");
  if (error) throw error;
  return new Set(((data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()));
}

/** Eine Firma mit ihren drei Sequenz-Schritten — fuer die Dashboard-Uebersicht. */
export interface SequenzZeile {
  zielfirma_id: string;
  firma: string;
  firma_status: string;
  schritte: { schritt: number; status: EntwurfStatus; gesendet_at: string | null; faellig_am: string | null }[];
}

/**
 * Laufende und abgeschlossene Sequenzen, neueste Aktivitaet zuerst.
 * Rein lesend.
 */
export async function getSequenzen(limit = 60): Promise<SequenzZeile[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("zielfirma_id, schritt, status, gesendet_at, faellig_am, updated_at, zielfirmen(firma, status)")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  // Eigener Typ statt StellenEntwurf: die Abfrage waehlt nur wenige Spalten aus,
  // eine Zuweisung auf den vollen Entwurfs-Typ waere gelogen.
  type Zeile = {
    zielfirma_id: string; schritt: number; status: EntwurfStatus;
    gesendet_at: string | null; faellig_am: string | null;
    zielfirmen?: { firma?: string; status?: string } | { firma?: string; status?: string }[] | null;
  };

  const proFirma = new Map<string, SequenzZeile>();
  for (const r of (data ?? []) as unknown as Zeile[]) {
    // Supabase liefert die Relation je nach Beziehung als Objekt ODER als Array.
    const fk = Array.isArray(r.zielfirmen) ? r.zielfirmen[0] : r.zielfirmen;
    let z = proFirma.get(r.zielfirma_id);
    if (!z) {
      if (proFirma.size >= limit) continue;
      z = {
        zielfirma_id: r.zielfirma_id,
        firma: fk?.firma ?? "—",
        firma_status: fk?.status ?? "aktiv",
        schritte: [],
      };
      proFirma.set(r.zielfirma_id, z);
    }
    z.schritte.push({ schritt: r.schritt, status: r.status, gesendet_at: r.gesendet_at, faellig_am: r.faellig_am });
  }
  for (const z of proFirma.values()) z.schritte.sort((a, b) => a.schritt - b.schritt);
  return [...proFirma.values()];
}

/** Wie viele Mails sind heute je Schritt faellig? Grundlage der drei Kacheln. */
export async function getHeuteFaellig(): Promise<Record<number, number>> {
  if (!configured()) return {};
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("schritt")
    .eq("status", "freigegeben")
    .is("gesendet_at", null)
    .not("faellig_am", "is", null)
    .lte("faellig_am", new Date().toISOString());
  if (error) throw error;
  const out: Record<number, number> = {};
  for (const r of (data ?? []) as { schritt: number }[]) out[r.schritt] = (out[r.schritt] ?? 0) + 1;
  return out;
}

/**
 * Firmen MIT Adresse, aber OHNE Stellensignal.
 *
 * Fuer die Variante ohne Stellenanzeige. Loest den Engpass: Es gibt 240
 * Betriebe mit Adresse, aber nur 29 Fachkraft-Signale — ohne diesen Weg
 * bliebe die grosse Mehrheit unerreichbar, solange die Arbeitsagentur nicht
 * antwortet.
 *
 * Nur Betriebe, die branchlich klar passen ("ziel"). Bei den unklaren waere
 * eine Mail ohne konkreten Anlass zu wenig zielgenau.
 */
export async function getFirmenOhneSignal(limit: number): Promise<FirmaOutreach[]> {
  if (!configured()) return [];

  const { data: mitSignal } = await db().from("stellen_signale").select("zielfirma_id");
  const hatSignal = new Set(((mitSignal ?? []) as { zielfirma_id: string }[]).map((r) => r.zielfirma_id));

  const { data: vorhandene } = await db().from("stellen_entwuerfe").select("zielfirma_id");
  const hatEntwurf = new Set(((vorhandene ?? []) as { zielfirma_id: string }[]).map((r) => r.zielfirma_id));

  const { data, error } = await db()
    .from("zielfirmen").select("*").eq("status", "aktiv").not("email", "is", null);
  if (error) throw error;

  const { ordneEin } = await import("@/lib/stellensignale/branche");
  const kandidaten = ((data ?? []) as Zielfirma[])
    .filter((f) => !hatSignal.has(f.id) && !hatEntwurf.has(f.id))
    .filter((f) => ordneEin(f.firma, f.gewerk).relevanz === "ziel")
    // Als FirmaOutreach abbilden — ohne Stelle, das signalisiert dem Prompt
    // die andere Variante.
    .map((f): FirmaOutreach => ({
      zielfirma_id: f.id, firma: f.firma, gewerk: f.gewerk, ort: f.ort, plz: f.plz,
      website: f.website, email: f.email, email_quelle: f.email_quelle,
      email_confidence: f.email_confidence, gf_name: f.gf_name, firma_status: f.status,
      signal_id: "", stellentitel: "", quelle: "karriereseite", quelle_url: null,
      raw_text: null, erstfund: f.created_at.slice(0, 10), letzter_fund: f.created_at.slice(0, 10),
      ist_fachkraft: false, wochen_offen: 0, ist_heiss: false, anzahl_signale: 0,
    }));

  const min = mindestScore();
  return sortiereNachChance(kandidaten.filter((f) => erreichbarkeit(f).score >= min)).slice(0, limit);
}

export interface SuppressionEintrag {
  email: string;
  grund: string;
  quelle: string | null;
  detail: string | null;
  created_at: string;
}

// Gesperrte Adressen mit Begründung — fürs Dashboard. Neueste zuerst.
export async function getSuppressionListe(limit = 100): Promise<SuppressionEintrag[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("stellen_suppression")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SuppressionEintrag[];
}

export async function addSuppression(input: {
  email: string;
  grund: "hard_bounce" | "complaint" | "opt_out" | "manuell";
  quelle?: string;
  detail?: string;
}): Promise<void> {
  const { error } = await db()
    .from("stellen_suppression")
    .upsert({ ...input, email: input.email.toLowerCase().trim() }, { onConflict: "email" });
  if (error) throw error;
}

// Entwurf zu einer SES-MessageId finden — für eingehende Bounce-/Complaint-Events.
export async function getEntwurfByMessageId(messageId: string): Promise<StellenEntwurf | null> {
  if (!configured()) return null;
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("*")
    .eq("ses_message_id", messageId)
    .maybeSingle();
  if (error) throw error;
  return (data as StellenEntwurf) ?? null;
}

// Entwürfe + Firmen-Kontext für die Anzeige. Neueste zuerst.
export async function getEntwuerfe(): Promise<StellenEntwurfMitFirma[]> {
  if (!configured()) return [];
  const { data, error } = await db()
    .from("stellen_entwuerfe")
    .select("*, zielfirmen(firma, ort, gewerk, email, email_confidence)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  // Supabase liefert die Relation verschachtelt → flach machen.
  return ((data ?? []) as (StellenEntwurf & {
    zielfirmen?: { firma?: string; ort?: string | null; gewerk?: string | null; email?: string | null; email_confidence?: number | null };
  })[]).map((r) => ({
    ...r,
    firma: r.zielfirmen?.firma ?? "—",
    ort: r.zielfirmen?.ort ?? null,
    gewerk: r.zielfirmen?.gewerk ?? null,
    email: r.zielfirmen?.email ?? null,
    email_confidence: r.zielfirmen?.email_confidence ?? null,
    stellentitel: null,
  }));
}
