import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pfade, die ohne Auth erreichbar sein müssen (Pitch-Seiten für Leads, Tracking, Webhooks, etc.)
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/p/",
  "/r/",
  "/api/",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;
  const { data: { user } } = await supabase.auth.getUser();

  // Public-Pfade (Pitch, Referenzen-Formular, APIs) immer erlauben, ohne Auth-Check
  if (isPublicPath(pathname)) {
    // Eingeloggt auf Login-Seite → redirect zum Dashboard
    if (user && pathname.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Alle anderen Routen (Admin-Dashboard) erfordern Login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
