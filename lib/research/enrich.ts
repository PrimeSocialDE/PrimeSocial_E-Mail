// ─────────────────────────────────────────────────────────────────
// ENRICH — einen Lead anreichern (Leads-Stufe).
//  1. Website inkl. IMPRESSUM scrapen → Summary, GF-Name, allgemeine Mail,
//     Telefon, E-Mail-Pool (scrapeWebsiteForContact priorisiert /impressum)
//  2. Zwei Ziel-Mails bestimmen: Geschäftsführer + Marketing-Verantwortlicher
//     (via Hunter Domain-Search + Website-Pool). Plus allgemeine Firmen-Mail.
//  3. best_email für den Versand wählen (Marketing → GF → allgemein) + Verify.
// Wird zu KEINER der beiden Ziel-Mails etwas gefunden, bleibt das sichtbar
// (gf_email/marketing_email = null → Hinweis in der UI).
// Instagram wird hier NICHT gescraped (nur auf Anfrage).
// ─────────────────────────────────────────────────────────────────
import { scrapeWebsiteForContact } from "@/lib/website-scraper";
import { searchDomain, findEmail, verifyEmail, extractDomain } from "@/lib/hunter";
import { updateProspect, domainOf, buildDedupKey } from "@/lib/research/db";
import { upsertCompany } from "@/lib/company/db";
import type { ResearchProspect, EmailVerifyStatus } from "@/types/research";

const GENERIC_RE = /^(info|kontakt|contact|office|mail|hallo|hello|service|empfang|praxis|kanzlei|zentrale)@/i;
function isGeneric(email: string): boolean { return GENERIC_RE.test(email); }
function isPersonal(email: string): boolean {
  const local = email.split("@")[0].toLowerCase();
  return !isGeneric(email) && /[._-]/.test(local);
}

const MARKETING_RE = /(market|kommunikation|social|pr\b|presse|content)/i;
const LEADER_RE = /(gesch[äa]ftsf|inhaber|owner|ceo|gr[üu]nder|founder|managing|vorstand|leitung|prokurist)/i;

interface HunterPerson { email: string; position: string | null; firstName: string | null; lastName: string | null }

export async function enrichProspect(prospect: ResearchProspect): Promise<ResearchProspect> {
  let gfName: string | null = prospect.gf_name;
  let summary: string | null = prospect.website_summary;
  let phone: string | null = prospect.phone;
  let websiteEmails: string[] = [];

  const siteDomain = domainOf(prospect.website);
  const onDomain = (e: string) => !siteDomain || domainOf(e) === siteDomain;

  // 1) Website + Impressum scrapen
  if (prospect.website) {
    try {
      const contact = await scrapeWebsiteForContact(prospect.website);
      gfName = contact.gfName ?? gfName;
      summary = contact.websiteSummary ?? summary;
      phone = contact.phone ?? phone;
      websiteEmails = (contact.emails ?? []).filter(onDomain);
    } catch (e) {
      console.warn(`[research/enrich] Website-Scrape fehlgeschlagen für ${prospect.company_name}:`, e);
    }
  }

  // allgemeine Firmen-Mail (info@/kontakt@) aus dem Impressum-Pool
  const generalEmail = websiteEmails.find(isGeneric) ?? null;

  // 2) Hunter Domain-Search für rollenbasierte Adressen
  let hunter: HunterPerson[] = [];
  if (siteDomain) {
    try {
      const ds = await searchDomain(extractDomain(siteDomain));
      hunter = (ds?.emails ?? [])
        .map((e) => ({ email: e.email, position: e.position, firstName: e.firstName, lastName: e.lastName }))
        .filter((e) => onDomain(e.email));
    } catch { /* ignore */ }
  }

  // ── Marketing-Mail ──
  const mk = hunter.find((e) => MARKETING_RE.test(e.position ?? ""));
  let marketingEmail = mk?.email ?? null;
  if (!marketingEmail) {
    // schwaches Website-Signal: persönliche Mail mit Marketing-Bezug im local-part
    marketingEmail = websiteEmails.find((e) => MARKETING_RE.test(e.split("@")[0])) ?? null;
  }

  // ── GF-Mail + GF-Name ──
  const ld = hunter.find((e) => LEADER_RE.test(e.position ?? ""));
  let gfEmail = ld?.email ?? null;
  const ldName = ld ? [ld.firstName, ld.lastName].filter(Boolean).join(" ") : null;
  if (ldName) gfName = gfName ?? ldName;

  // GF-Mail über den GF-Namen suchen, falls Rolle nicht direkt traf
  if (!gfEmail && gfName) {
    const parts = gfName.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
    gfEmail = websiteEmails.find((e) => isPersonal(e) && parts.some((p) => e.split("@")[0].toLowerCase().includes(p))) ?? null;
    if (!gfEmail && siteDomain && parts.length >= 2) {
      try {
        const found = await findEmail(extractDomain(siteDomain), parts[0], parts[parts.length - 1]);
        if (found?.email && (found.score ?? 0) >= 50) gfEmail = found.email;
      } catch { /* ignore */ }
    }
  }

  // 3) Versand-Adresse wählen: Marketing → GF → allgemein
  const bestEmail = marketingEmail ?? gfEmail ?? generalEmail;

  let verifyStatus: EmailVerifyStatus = "unknown";
  if (bestEmail) {
    try {
      const v = await verifyEmail(bestEmail);
      verifyStatus = (v?.result as EmailVerifyStatus) ?? "unknown";
    } catch { verifyStatus = "unknown"; }
  }

  const dedupKey = buildDedupKey(siteDomain, prospect.instagram_handle);

  const updated = await updateProspect(prospect.id, {
    status: "enriched",
    gf_name: gfName,
    gf_email: gfEmail,
    marketing_email: marketingEmail,
    general_email: generalEmail,
    best_email: bestEmail,
    email_verify_status: verifyStatus,
    website_summary: summary,
    phone,
    dedup_key: dedupKey ?? prospect.dedup_key,
  });

  // Zentrale Datenbank anreichern (Lücken füllen, Mails/Daten sammeln).
  try {
    await upsertCompany({
      company_name: prospect.company_name,
      website: prospect.website,
      stadt: prospect.city,
      bundesland: prospect.bundesland,
      branche: prospect.branche_final ?? prospect.gmaps_category,
      employee_bucket: prospect.employee_bucket,
      gf_name: gfName, gf_email: gfEmail, marketing_email: marketingEmail, general_email: generalEmail,
      phone,
      rating: prospect.rating, reviews_count: prospect.reviews_count,
      instagram_handle: prospect.instagram_handle,
      source: "research",
    });
  } catch (e) { console.warn("[research/enrich] upsertCompany fehlgeschlagen:", e); }

  return updated;
}
