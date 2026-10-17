import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

// Public, secret-free liveness check: can this app reach the database with the
// publishable key? Returns only ok/not ok.
export async function GET() {
  let ok = false;
  try {
    const { url, anon } = publicEnv();
    const res = await fetch(`${url}/rest/v1/public_release?select=id&limit=1`, {
      headers: { apikey: anon },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
