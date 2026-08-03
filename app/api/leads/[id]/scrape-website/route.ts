import { NextRequest, NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/supabase";
import { scrapeWebsiteForContact } from "@/lib/website-scraper";
import { findEmail, searchDomain, extractDomain } from "@/lib/hunter";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLead(id);

    const url = lead.website_url;
    if (!url) return NextResponse.json({ error: "Keine Website-URL am Lead hinterlegt" }, { status: 400 });

    const domain = extractDomain(url);

    // ── Step 1: Website scrapen (Impressum → GF-Name, E-Mails) ──────────────
    const contact = await scrapeWebsiteForContact(url);

    // ── Step 2: Hunter Email Finder (wenn GF-Name bekannt) ───────────────────
    let hunterResult: { email: string; score: number; position: string | null } | null = null;
    if (domain && contact.gfName) {
      const parts = contact.gfName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ");
      if (firstName && lastName) {
        const found = await findEmail(domain, firstName, lastName);
        if (found) hunterResult = { email: found.email, score: found.score, position: found.position };
      }
    }

    // ── Step 3: Hunter Domain Search (Fallback wenn kein GF-Name / kein Finder-Treffer) ──
    let domainEmails: Array<{ email: string; score: number; firstName: string | null; lastName: string | null; position: string | null }> = [];
    if (domain && !hunterResult) {
      const domainResult = await searchDomain(domain);
      if (domainResult) {
        domainEmails = domainResult.emails.map((e) => ({
          email: e.email,
          score: e.score,
          firstName: e.firstName,
          lastName: e.lastName,
          position: e.position,
        }));
      }
    }

    // ── Beste E-Mail bestimmen ────────────────────────────────────────────────
    // Priorität: Hunter Finder > Scraping-Best > Hunter Domain > Domain-Fallback
    const bestEmail = hunterResult?.email ?? contact.bestEmail ?? domainEmails[0]?.email ?? null;

    // ── Lead-Felder auto-updaten ──────────────────────────────────────────────
    const updates: Record<string, unknown> = {};
    if (contact.websiteSummary && !lead.website_summary) {
      updates.website_summary = contact.websiteSummary;
    }
    if (contact.gfName && !lead.contact_name) {
      const parts = contact.gfName.trim().split(/\s+/);
      updates.contact_first_name = parts[0] ?? null;
      updates.contact_last_name = parts.slice(1).join(" ") || null;
      updates.contact_name = contact.gfName;
    }
    if (bestEmail && !lead.email) {
      updates.email = bestEmail;
    }

    if (Object.keys(updates).length > 0) {
      await updateLead(id, updates as Parameters<typeof updateLead>[1]);
    }

    return NextResponse.json({
      // Scraping results
      emails: contact.emails,
      bestEmail,
      gfName: contact.gfName,
      phone: contact.phone,
      websiteSummary: contact.websiteSummary,
      // Hunter results
      hunter: hunterResult
        ? { source: "finder", ...hunterResult }
        : domainEmails.length > 0
        ? { source: "domain", emails: domainEmails }
        : null,
      updatedFields: Object.keys(updates),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
