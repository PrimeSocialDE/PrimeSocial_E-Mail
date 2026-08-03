import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { updateEmailSent } from "@/lib/supabase";

// Schutz wie beim Brevo-Webhook: harter Cap, sodass eine hängende DB nicht
// pro Mail-Öffnung Vercel-Sekunden frisst. DB-Lookup auf emails_sent.id
// (Primary Key, indexed) ist normalerweise <50ms.
export const runtime = "nodejs";
export const maxDuration = 5;
export const dynamic = "force-dynamic";

// 1×1 transparentes GIF Pixel
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
} as const;

export async function GET(request: NextRequest) {
  const emailId = request.nextUrl.searchParams.get("id");

  // Pixel SOFORT zurückgeben — DB-Update läuft im Hintergrund.
  // Damit ist die Function-Wall-Time <20ms unabhängig vom DB-Status,
  // und Mail-Clients (Gmail/Apple) können das Pixel prefetchen ohne uns zu kosten.
  if (emailId) {
    after(async () => {
      try {
        await updateEmailSent(emailId, { opened_at: new Date().toISOString() });
      } catch (err) {
        // Tracking-Fehler dürfen die UX nie brechen.
        console.error("[track/open] update failed:", err);
      }
    });
  }

  return new NextResponse(PIXEL, { headers: PIXEL_HEADERS });
}
