// ─────────────────────────────────────────────────────────────────
// Eigener Anthropic-Wrapper für das MANUELLE Modul.
// Separater Client (gleicher API-Key via Env), damit lib/anthropic.ts
// (Automation) unberührt bleibt.
// ─────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";
import type { ManualEmail } from "@/types/manual";

const MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}

function extractJson<T>(text: string): T {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Claude hat kein valides JSON zurückgegeben");
  return JSON.parse(json) as T;
}

// ─────────────── Template aus Beispielmails generieren ───────────────
export async function generateTemplateFromExamples(examples: string): Promise<{
  subject: string;
  body: string;
  placeholders: string[];
}> {
  const system = `Du bist ein erfahrener Cold-Outreach-Texter für PrimeSocial (Social-Media-Marketing-Agentur).
Deine Aufgabe: aus 1–3 echten Beispielmails ein WIEDERVERWENDBARES Template extrahieren.

REGELN:
- Erhalte Struktur, Tonalität und Sprachstil der Beispiele EXAKT. Nicht "aufhübschen".
- Erkenne alle variablen Stellen (Vorname, Firmenname, Branche, Ort, konkrete Details) und ersetze sie durch {{platzhalter}}-Tokens in lowerCamelCase, z.B. {{firstName}}, {{company}}, {{branche}}, {{city}}.
- Verwende konsistente, sprechende Platzhalter-Namen. Gleiche Bedeutung = gleicher Name.
- Wenn mehrere Beispiele vorliegen: leite das gemeinsame Muster ab, nicht eine einzelne Mail kopieren.
- Antworte AUSSCHLIESSLICH mit validem JSON, kein Text davor/danach.`;

  const userPrompt = `Hier sind die Beispielmail(s). Erzeuge daraus ein Template:

${examples}

Antworte NUR im JSON-Format:
{
  "subject": "Betreffzeile mit {{platzhaltern}} wo sinnvoll",
  "body": "Kompletter Mail-Body mit {{platzhaltern}}",
  "placeholders": ["firstName", "company", "..."]
}`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const result = extractJson<{ subject: string; body: string; placeholders: string[] }>(text);
  return {
    subject: result.subject ?? "",
    body: result.body ?? "",
    placeholders: Array.isArray(result.placeholders) ? result.placeholders : [],
  };
}

// ─────────────── AI-Tipps (datengetrieben, schreibt NICHT) ───────────────
// Bekommt den Entwurf + die letzten Mails inkl. Open/Response-Status als Kontext
// und gibt NUR eine Liste von Hinweisen zurück.
export async function getEmailTips(
  draft: { subject: string; body: string },
  history: Pick<ManualEmail, "subject" | "opened_at" | "response_status">[]
): Promise<{ tips: string[] }> {
  const stats = history.map((h) => ({
    subject: h.subject,
    opened: !!h.opened_at,
    response: h.response_status,
  }));

  const system = `Du bist ein kritischer Cold-Outreach-Coach für PrimeSocial.
Du analysierst E-Mail-Entwürfe und gibst NUR Hinweise und Verbesserungsvorschläge.
WICHTIG: Du schreibst die Mail NICHT um und lieferst KEINEN fertigen Text. Nur Tipps.

Arbeite DATENGETRIEBEN auf Basis der mitgelieferten Historie (Betreff, geöffnet ja/nein, Antwortstatus):
- Wenn Betreffzeilen-Muster wie das im Entwurf zuletzt selten geöffnet wurden → warne konkret und schlage eine andere Richtung vor.
- Wenn Muster überdurchschnittlich oft geöffnet/beantwortet wurden → nenne das als positiven Hinweis zum Beibehalten.
- Prüfe außerdem klassisch: schwacher Opener, zu lange Sätze, unklarer/zu weicher CTA, zu viel "wir", Floskeln.

Antworte AUSSCHLIESSLICH mit validem JSON, kein Text davor/danach.`;

  const userPrompt = `ENTWURF:
Betreff: ${draft.subject}
Body:
${draft.body}

HISTORIE der letzten ${stats.length} manuellen Mails (JSON):
${JSON.stringify(stats, null, 2)}

Antworte NUR im JSON-Format:
{ "tips": ["Tipp 1", "Tipp 2", "..."] }`;

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const result = extractJson<{ tips: string[] }>(text);
  return { tips: Array.isArray(result.tips) ? result.tips : [] };
}

// ─────────────── Chat zum aktiven Umschreiben der Mail ───────────────
// Im Gegensatz zu getEmailTips DARF dieser Pfad den Body umschreiben.
export interface ManualChatTurn {
  role: "user" | "assistant";
  content: string;
}
export async function chatRewrite(
  history: ManualChatTurn[],
  currentDraft: { subject: string; body: string }
): Promise<{ reply: string; subject?: string; body?: string }> {
  const system = `Du bist ein Schreib-Assistent für PrimeSocial Cold-Outreach-Mails.
Du hilfst dem Nutzer, eine konkrete Mail iterativ zu verbessern und anzupassen
(z.B. Template auf eine andere Branche ummünzen).

Du DARFST den Mail-Body und -Betreff aktiv umschreiben.
Antworte locker und kurz im "reply"-Feld, was du geändert hast.
Wenn du eine neue Version der Mail lieferst, gib sie in "subject" und "body" zurück.
Behalte den lockeren, kompetenten PrimeSocial-Ton (keine Superlative, auf Augenhöhe).

Antworte AUSSCHLIESSLICH mit validem JSON, kein Text davor/danach.`;

  const contextNote = `AKTUELLER ENTWURF:
Betreff: ${currentDraft.subject}
Body:
${currentDraft.body}

Reagiere auf die letzte Nutzer-Nachricht. Antworte NUR im JSON-Format:
{ "reply": "kurze Antwort an den Nutzer", "subject": "neuer Betreff (optional)", "body": "neuer Body (optional)" }`;

  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: contextNote },
  ];

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system,
    messages,
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const result = extractJson<{ reply: string; subject?: string; body?: string }>(text);
  return { reply: result.reply ?? "", subject: result.subject, body: result.body };
}
