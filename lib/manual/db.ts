// ─────────────────────────────────────────────────────────────────
// Daten-Layer für das MANUELLE Modul.
// Nutzt den bestehenden Supabase-Client NUR LESEND als Import
// (getClient/isSupabaseConfigured) — die Automation-Datei wird nicht
// verändert. Alle Queries laufen ausschließlich gegen `manual_`-Tabellen
// (Ausnahme: rein lesender Lead-Abgleich gegen primesocial_leads).
// ─────────────────────────────────────────────────────────────────
import { getClient, isSupabaseConfigured } from "@/lib/supabase";
import type {
  ManualContact,
  ManualTemplate,
  ManualDriveLink,
  ManualEmail,
  LeadMatchResult,
  ManualRecipientHistory,
} from "@/types/manual";

function configured(): boolean {
  return isSupabaseConfigured();
}
function db() {
  return getClient();
}

// ─────────────── Contacts ───────────────
export async function getContacts(): Promise<ManualContact[]> {
  if (!configured()) return [];
  const { data, error } = await db().from("manual_contacts").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualContact[];
}

export async function getContactByEmail(email: string): Promise<ManualContact | null> {
  if (!configured()) return null;
  // manual_contacts hat keine UNIQUE-Constraint auf email → es können mehrere
  // Zeilen existieren. Daher limit(1) statt maybeSingle (das bei >1 wirft).
  const { data, error } = await db()
    .from("manual_contacts").select("*").eq("email", email)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] as ManualContact) ?? null;
}

export async function createContact(
  c: Partial<Omit<ManualContact, "id" | "created_at" | "updated_at">> & { email: string }
): Promise<ManualContact> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("manual_contacts").insert(c).select().single();
  if (error) throw new Error(error.message);
  return data as ManualContact;
}

export async function updateContact(id: string, updates: Partial<ManualContact>): Promise<ManualContact> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db()
    .from("manual_contacts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as ManualContact;
}

export async function deleteContact(id: string): Promise<void> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { error } = await db().from("manual_contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────── Templates ───────────────
export async function getTemplates(): Promise<ManualTemplate[]> {
  if (!configured()) return [];
  const { data, error } = await db().from("manual_templates").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualTemplate[];
}

export async function getTemplate(id: string): Promise<ManualTemplate | null> {
  if (!configured()) return null;
  const { data, error } = await db().from("manual_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ManualTemplate) ?? null;
}

export async function createTemplate(
  t: { name: string; subject?: string | null; body: string; placeholders?: string[]; source_examples?: string | null }
): Promise<ManualTemplate> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("manual_templates").insert({
    name: t.name,
    subject: t.subject ?? null,
    body: t.body,
    placeholders: t.placeholders ?? [],
    source_examples: t.source_examples ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as ManualTemplate;
}

export async function updateTemplate(id: string, updates: Partial<ManualTemplate>): Promise<ManualTemplate> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db()
    .from("manual_templates")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as ManualTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { error } = await db().from("manual_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────── Drive-Links ───────────────
export async function getDriveLinks(): Promise<ManualDriveLink[]> {
  if (!configured()) return [];
  const { data, error } = await db().from("manual_drive_links").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualDriveLink[];
}

export async function createDriveLink(
  l: { label: string; url: string; category?: string | null }
): Promise<ManualDriveLink> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("manual_drive_links").insert({
    label: l.label, url: l.url, category: l.category ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data as ManualDriveLink;
}

export async function updateDriveLink(id: string, updates: Partial<ManualDriveLink>): Promise<ManualDriveLink> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("manual_drive_links").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as ManualDriveLink;
}

export async function deleteDriveLink(id: string): Promise<void> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { error } = await db().from("manual_drive_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─────────────── Manual Emails ───────────────
export async function getManualEmails(): Promise<ManualEmail[]> {
  if (!configured()) return [];
  const { data, error } = await db().from("manual_emails").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualEmail[];
}

export async function createManualEmail(
  e: Omit<ManualEmail, "id" | "tracking_id" | "created_at" | "opened_at" | "open_count" | "scheduled_for" | "send_error">
    & { tracking_id?: string; scheduled_for?: string | null; send_error?: string | null }
): Promise<ManualEmail> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("manual_emails").insert(e).select().single();
  if (error) throw new Error(error.message);
  return data as ManualEmail;
}

// Fällige geplante Mails: Versandzeitpunkt erreicht, noch nicht gesendet,
// kein vorheriger Fehler (kein Endlos-Retry). Für den Cron.
export async function getDueScheduledEmails(limit = 25): Promise<ManualEmail[]> {
  if (!configured()) return [];
  const nowIso = new Date().toISOString();
  const { data, error } = await db()
    .from("manual_emails").select("*")
    .is("sent_at", null)
    .is("send_error", null)
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ManualEmail[];
}

export async function updateManualEmail(id: string, updates: Partial<ManualEmail>): Promise<ManualEmail> {
  if (!configured()) throw new Error("Supabase nicht konfiguriert");
  const { data, error } = await db().from("manual_emails").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as ManualEmail;
}

// Wurde an diese Adresse schon mal eine manuelle Mail versendet?
export async function getManualHistoryForRecipient(email: string): Promise<ManualRecipientHistory> {
  if (!configured()) return { count: 0, lastSentAt: null, lastSubject: null };
  const { data, error } = await db()
    .from("manual_emails")
    .select("subject, sent_at")
    .eq("recipient_email", email)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { subject: string; sent_at: string }[];
  return {
    count: rows.length,
    lastSentAt: rows[0]?.sent_at ?? null,
    lastSubject: rows[0]?.subject ?? null,
  };
}

export async function getManualEmailByTrackingId(trackingId: string): Promise<ManualEmail | null> {
  if (!configured()) return null;
  const { data, error } = await db().from("manual_emails").select("*").eq("tracking_id", trackingId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ManualEmail) ?? null;
}

// ─────────────── Lead-Abgleich (REIN LESEND gegen Automation) ───────────────
// Kein Schreibzugriff, keine Mutation an primesocial_leads.
export async function checkLeadByEmail(email: string): Promise<LeadMatchResult> {
  if (!configured()) return { matched: false };
  // Empfänger-Adresse kann in primesocial_leads theoretisch mehrfach vorkommen
  // → limit(1) statt maybeSingle, das bei >1 Zeilen wirft.
  const { data, error } = await db()
    .from("primesocial_leads")
    .select("company_name, segment, workflow_step, status")
    .eq("email", email)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  if (!row) return { matched: false };
  return {
    matched: true,
    company_name: row.company_name ?? null,
    segment: row.segment ?? null,
    workflow_step: row.workflow_step ?? null,
    status: row.status ?? null,
  };
}
