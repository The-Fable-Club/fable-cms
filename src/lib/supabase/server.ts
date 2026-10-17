import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client for server components, route handlers and server actions.
 * It acts as the signed-in user (cookie session) with the publishable key, so
 * row level security applies to everything it does.
 */
export async function createClient() {
  const store = await cookies();
  const { url, anon } = publicEnv();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session on every request, so this is fine.
        }
      },
    },
  });
}
