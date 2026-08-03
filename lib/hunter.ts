/**
 * hunter.ts
 * Hunter.io API integration for finding & verifying professional email addresses.
 */

const HUNTER_BASE = "https://api.hunter.io/v2";

function getApiKey(): string | null {
  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    console.warn("[Hunter] HUNTER_API_KEY is not set");
    return null;
  }
  return key;
}

export function extractDomain(input: string): string {
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return input.replace(/^www\./, "");
  }
}

// --- Types ---

export interface HunterFinderResult {
  email: string;
  score: number;
  position: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface HunterDomainResult {
  emails: {
    email: string;
    type: string;
    score: number;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
  }[];
}

export interface HunterVerifyResult {
  email: string;
  result: string; // "deliverable" | "undeliverable" | "risky" | "unknown"
  score: number;
}

// --- Functions ---

export async function findEmail(
  domain: string,
  firstName: string,
  lastName: string
): Promise<HunterFinderResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const cleanDomain = extractDomain(domain);
    const params = new URLSearchParams({
      domain: cleanDomain,
      first_name: firstName,
      last_name: lastName,
      api_key: apiKey,
    });

    const res = await fetch(`${HUNTER_BASE}/email-finder?${params}`);
    if (!res.ok) {
      console.error(`[Hunter] email-finder failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    const d = json.data;
    if (!d?.email) return null;

    return {
      email: d.email,
      score: d.score ?? 0,
      position: d.position ?? null,
      firstName: d.first_name ?? null,
      lastName: d.last_name ?? null,
    };
  } catch (error) {
    console.error("[Hunter] email-finder error:", error);
    return null;
  }
}

export async function searchDomain(
  domain: string
): Promise<HunterDomainResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const cleanDomain = extractDomain(domain);
    const params = new URLSearchParams({
      domain: cleanDomain,
      api_key: apiKey,
    });

    const res = await fetch(`${HUNTER_BASE}/domain-search?${params}`);
    if (!res.ok) {
      console.error(`[Hunter] domain-search failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    const emails = json.data?.emails;
    if (!Array.isArray(emails)) return null;

    return {
      emails: emails.map((e: Record<string, unknown>) => ({
        email: e.value as string,
        type: (e.type as string) ?? "unknown",
        score: (e.confidence as number) ?? 0,
        firstName: (e.first_name as string) ?? null,
        lastName: (e.last_name as string) ?? null,
        position: (e.position as string) ?? null,
      })),
    };
  } catch (error) {
    console.error("[Hunter] domain-search error:", error);
    return null;
  }
}

export async function verifyEmail(
  email: string
): Promise<HunterVerifyResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      email,
      api_key: apiKey,
    });

    const res = await fetch(`${HUNTER_BASE}/email-verifier?${params}`);
    if (!res.ok) {
      console.error(`[Hunter] email-verifier failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    const d = json.data;
    if (!d?.email) return null;

    return {
      email: d.email,
      result: d.result ?? "unknown",
      score: d.score ?? 0,
    };
  } catch (error) {
    console.error("[Hunter] email-verifier error:", error);
    return null;
  }
}
