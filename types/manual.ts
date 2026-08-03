// ─────────────────────────────────────────────────────────────────
// Typen für das MANUELLE E-Mail-Modul.
// Strikt getrennt von der Automation (types/index.ts) — eigene Tabellen
// mit Prefix `manual_`. Keine Abhängigkeit zur Automation-Logik.
// ─────────────────────────────────────────────────────────────────

// Versand nur über die geschützte Hauptdomain primesocial.de.
// prime-social.de (Automation) ist hier bewusst NICHT erlaubt.
export type ManualSender = "max@primesocial.de" | "niklas@primesocial.de";
export const MANUAL_SENDERS: ManualSender[] = ["max@primesocial.de", "niklas@primesocial.de"];
export const MANUAL_DEFAULT_SENDER: ManualSender = "max@primesocial.de";

export type ManualResponseStatus = "no_response" | "replied" | "interested" | "not_interested";
export const MANUAL_RESPONSE_STATUSES: ManualResponseStatus[] = ["no_response", "replied", "interested", "not_interested"];
export const MANUAL_RESPONSE_LABELS: Record<ManualResponseStatus, string> = {
  no_response:    "No Response",
  replied:        "Replied",
  interested:     "Interested",
  not_interested: "Not Interested",
};

export interface ManualContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  branche: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManualTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  placeholders: string[];        // z.B. ["firstName","company","branche"]
  source_examples: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManualDriveLink {
  id: string;
  label: string;
  url: string;
  category: string | null;
  created_at: string;
}

export interface ManualEmail {
  id: string;
  contact_id: string | null;
  template_id: string | null;
  sender: string;
  recipient_email: string;
  subject: string;
  body: string;
  tracking_id: string;
  brevo_message_id: string | null;
  scheduled_for: string | null;   // ISO — geplanter Versandzeitpunkt (null = sofort/bereits gesendet)
  send_error: string | null;      // gesetzt, wenn ein geplanter Versand fehlschlug
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
  response_status: ManualResponseStatus;
  matched_lead_warning: boolean;
  created_at: string;
}

// Ergebnis des Lead-Abgleichs (rein lesend gegen primesocial_leads)
export interface LeadMatchResult {
  matched: boolean;
  segment?: string | null;
  workflow_step?: number | null;
  status?: string | null;
  company_name?: string | null;
}

// Historie früherer manueller Mails an denselben Empfänger
export interface ManualRecipientHistory {
  count: number;              // bereits versendete manuelle Mails an diese Adresse
  lastSentAt: string | null;  // ISO — letzter Versand
  lastSubject: string | null; // Betreff der letzten Mail
}
