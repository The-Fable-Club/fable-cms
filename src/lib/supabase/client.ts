import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/** Browser client (publishable key + the signed-in admin's session). Used for image uploads. */
export function createClient() {
  const { url, anon } = publicEnv();
  return createBrowserClient(url, anon);
}
