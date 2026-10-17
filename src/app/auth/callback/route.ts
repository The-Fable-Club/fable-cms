import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// GitHub sends the browser back here with a one-time code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  const code = searchParams.get("code");
  if (!code) return to("/login?error=oauth");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to("/login?error=oauth");

  // Signed in with GitHub is not enough: the account must be on the admin list.
  const admin = await getAdmin();
  if (!admin) {
    await supabase.auth.signOut();
    return to("/login?error=forbidden");
  }
  return to("/");
}
