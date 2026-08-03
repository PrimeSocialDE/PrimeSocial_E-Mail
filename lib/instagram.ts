/**
 * Extracts a clean Instagram handle from a full URL or raw handle.
 *
 * Examples:
 *   "https://www.instagram.com/masterrind_gmbh/"  → "masterrind_gmbh"
 *   "https://instagram.com/masterrind_gmbh"       → "masterrind_gmbh"
 *   "@masterrind_gmbh"                             → "masterrind_gmbh"
 *   "masterrind_gmbh"                              → "masterrind_gmbh"
 */
export function extractInstagramHandle(input: string): string {
  let value = input.trim();

  // Handle full URLs: extract path segment after instagram.com
  try {
    const url = new URL(value);
    if (url.hostname.replace("www.", "") === "instagram.com") {
      // pathname is e.g. "/masterrind_gmbh/" — grab first non-empty segment
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        value = segments[0];
      }
    }
  } catch {
    // Not a valid URL — treat as raw handle
  }

  // Strip leading @ and trailing slashes
  return value.replace(/^@/, "").replace(/\/+$/, "").trim();
}
