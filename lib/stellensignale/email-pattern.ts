// ─────────────────────────────────────────────────────────────────
// EMAIL-PATTERN-INFERENCE.
// Erkennt aus den auf einer Firmen-Website gefundenen E-Mails das Schema
// (z.B. "vorname.nachname@firma.de") und konstruiert daraus die vermutete
// GF-Mail — auch wenn die GF-Mail selbst NICHT auf der Seite steht.
//
// Reine Logik: keine Fetches, keine API-Calls. Voll testbar.
// Konstruierte Mails sind VERMUTUNGEN (quelle "pattern") und sollten vor
// dem Versand verifiziert oder zur Freigabe angezeigt werden.
// ─────────────────────────────────────────────────────────────────

// Generische Prefixe (keine persönlichen Mails) — für die Pattern-Erkennung
// unbrauchbar, weil sie keinen Namen kodieren.
const GENERIC = new Set([
  "info", "hallo", "hello", "kontakt", "contact", "service", "support", "mail",
  "email", "office", "admin", "noreply", "no-reply", "webmaster", "marketing",
  "sales", "vertrieb", "anfrage", "anfragen", "presse", "press", "team", "post",
  "job", "jobs", "karriere", "bewerbung", "sekretariat", "empfang", "buchhaltung",
]);

// Deutsche Umlaute/ß auflösen, Akzente entfernen, auf a–z reduzieren.
export function normName(token: string): string {
  return token
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // restliche Akzente
    .replace(/[^a-z]/g, "");
}

// Titel/Anreden, die kein Namensbestandteil sind.
const TITEL = new Set(["dr", "prof", "dipl", "ing", "med", "mba", "herr", "frau", "dr-ing"]);

// Vollen Namen → { first, last } (normalisiert). Titel raus, Bindestrich-
// Vornamen zusammengezogen, letztes Token = Nachname.
export function parseName(full: string | null | undefined): { first: string; last: string } | null {
  if (!full) return null;
  const tokens = full
    .split(/\s+/)
    .map((t) => t.replace(/\./g, ""))
    .filter((t) => t && !TITEL.has(normName(t)));
  if (tokens.length < 2) return null;
  const first = normName(tokens[0]);
  const last = normName(tokens[tokens.length - 1]);
  if (!first || !last) return null;
  return { first, last };
}

// Lokalteil einer persönlichen Mail → Schema-Template (order: first,last
// per DE-Konvention). Gibt null zurück, wenn nicht eindeutig (z.B. 1 Token).
export function classify(local: string): string | null {
  const l = local.toLowerCase();
  const sep = l.includes(".") ? "." : l.includes("_") ? "_" : l.includes("-") ? "-" : "";
  if (!sep) return null; // ein Token → mehrdeutig (Vorname? Nachname?), überspringen
  const parts = l.split(sep);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a || !b) return null;
  const styleA = a.length === 1 ? "{f}" : "{first}";
  const styleB = b.length === 1 ? "{l}" : "{last}";
  return `${styleA}${sep}${styleB}`;
}

// Template + Name + Domain → konstruierte E-Mail-Adresse.
export function construct(template: string, first: string, last: string, domain: string): string {
  const local = template
    .replace("{first}", first)
    .replace("{last}", last)
    .replace("{f}", first[0] ?? "")
    .replace("{l}", last[0] ?? "");
  return `${local}@${domain}`;
}

function isGeneric(email: string): boolean {
  const local = email.split("@")[0].toLowerCase();
  return GENERIC.has(local) || [...GENERIC].some((p) => local.startsWith(p + "."));
}

export interface PatternInferenz {
  email: string;        // konstruierte GF-Mail (Vermutung)
  template: string;     // erkanntes Schema
  confidence: number;   // 0–85 (nie 100 — es bleibt eine Vermutung)
  support: number;      // wie viele Mails das Schema stützen
}

// Kern: aus gefundenen Mails das Schema ableiten und auf den GF-Namen anwenden.
export function inferGfEmail(input: {
  emails: string[];
  gfName: string | null;
  domain: string;
}): PatternInferenz | null {
  const name = parseName(input.gfName);
  if (!name || !input.domain) return null;

  // Schemata aus persönlichen Mails DERSELBEN Domain sammeln.
  const votes = new Map<string, number>();
  for (const e of input.emails) {
    const [local, dom] = e.toLowerCase().split("@");
    if (!dom || dom.replace(/^www\./, "") !== input.domain.replace(/^www\./, "")) continue;
    if (isGeneric(e)) continue;
    const tpl = classify(local);
    if (tpl) votes.set(tpl, (votes.get(tpl) ?? 0) + 1);
  }
  if (votes.size === 0) return null;

  // Mehrheits-Schema wählen.
  let bestTpl = "";
  let bestCount = 0;
  for (const [tpl, count] of votes) {
    if (count > bestCount) {
      bestTpl = tpl;
      bestCount = count;
    }
  }

  // Confidence: separator-basierte Schemata sind verlässlich; mehr Belege = höher.
  const confidence = Math.min(85, 45 + bestCount * 20);
  return {
    email: construct(bestTpl, name.first, name.last, input.domain),
    template: bestTpl,
    confidence,
    support: bestCount,
  };
}
