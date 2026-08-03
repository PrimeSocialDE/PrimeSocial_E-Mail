import { NextRequest, NextResponse, after } from "next/server";
import { getManualEmailByTrackingId, updateManualEmail } from "@/lib/manual/db";

// Eigener Open-Tracking-Endpoint für manuelle Mails.
// KEIN Zusammenhang mit dem Automation-Webhook — schreibt nur in manual_emails.
export const runtime = "nodejs";
export const maxDuration = 5;
export const dynamic = "force-dynamic";

// 1×1 transparentes GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tracking_id: string }> }) {
  const { tracking_id } = await params;

  // Pixel sofort zurückgeben; DB-Update läuft im Hintergrund.
  if (tracking_id) {
    after(async () => {
      try {
        const email = await getManualEmailByTrackingId(tracking_id);
        if (!email) return;
        await updateManualEmail(email.id, {
          opened_at: email.opened_at ?? new Date().toISOString(),  // erster Öffnungszeitpunkt bleibt erhalten
          open_count: (email.open_count ?? 0) + 1,
        });
      } catch (err) {
        console.error("[manual/track] update failed:", err);
      }
    });
  }

  return new NextResponse(PIXEL, { headers: PIXEL_HEADERS });
}
