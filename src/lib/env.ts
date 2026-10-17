import { z } from "zod";

// NEXT_PUBLIC_* values must be referenced literally so Next can inline them.
const publicSchema = z.object({
  url: z.string().url(),
  anon: z.string().min(20),
});

/** The Supabase URL and publishable key. Both are safe to expose to the browser. */
export function publicEnv() {
  const parsed = publicSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Fill them in .env.local (see .env.example).",
    );
  }
  return parsed.data;
}
