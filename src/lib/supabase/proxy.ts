import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

// Pages that work without a session. Everything else needs one.
const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/auth\//, /^\/api\/health$/];

/**
 * Runs on every request (see src/proxy.ts): refreshes the Supabase session
 * cookies and sends signed-out visitors to /login. This is a convenience
 * gate only; real authorisation happens in `requireAdmin()` and in the
 * database's row level security.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anon } = publicEnv();

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() validates the session token and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;

  if (!signedIn && !PUBLIC_PATHS.some((re) => re.test(path))) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}
