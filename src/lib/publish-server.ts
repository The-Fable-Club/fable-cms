import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Snapshot } from "@/lib/contract";
import type { PublishDeps, RepublishDeps } from "@/lib/publish";
import type { EventRow, MemberRow } from "@/lib/snapshot";

/** Real dependencies for publish(): the signed-in admin's own session (row level security applies) and the deploy hook from the environment. */
export async function publishDeps(): Promise<PublishDeps> {
  const supabase = await createClient();
  const { url } = publicEnv();
  const fail = (what: string, message: string): never => {
    throw new Error(`${what}: ${message}`);
  };

  return {
    supabaseUrl: url,
    now: () => new Date(),
    async loadRows() {
      const [events, members] = await Promise.all([supabase.from("events").select("*"), supabase.from("members").select("*")]);
      if (events.error) fail("Could not read events", events.error.message);
      if (members.error) fail("Could not read members", members.error.message);
      return { events: (events.data ?? []) as EventRow[], members: (members.data ?? []) as MemberRow[] };
    },
    async lastPublishedAt() {
      const { data, error } = await supabase.from("releases").select("published_at").order("id", { ascending: false }).limit(1).maybeSingle();
      if (error) fail("Could not read releases", error.message);
      return data ? new Date(data.published_at) : null;
    },
    async insertRelease({ snapshot, note, publishedBy }) {
      const { data, error } = await supabase
        .from("releases")
        .insert({ snapshot, note, published_by: publishedBy, schema_version: snapshot.schema_version, deploy_state: "triggered" })
        .select("id")
        .single();
      if (error || !data) return fail("Could not save the release", error?.message ?? "no row returned");
      return { id: data.id as number };
    },
    hookUrl: process.env.VERCEL_DEPLOY_HOOK_URL?.trim() || null,
    fetchHook: async (hook) => {
      const res = await fetch(hook, { method: "POST", signal: AbortSignal.timeout(15000), cache: "no-store" });
      return { status: res.status };
    },
    async recordDeploy(id, state) {
      const { error } = await supabase.from("releases").update({ deploy_state: state }).eq("id", id);
      if (error) fail("Could not record the deploy", error.message);
    },
  };
}

export async function republishDeps(): Promise<RepublishDeps> {
  const base = await publishDeps();
  const supabase = await createClient();
  return {
    ...base,
    async loadRelease(id) {
      const { data, error } = await supabase.from("releases").select("snapshot").eq("id", id).maybeSingle();
      if (error) throw new Error(`Could not read release #${id}: ${error.message}`);
      return (data?.snapshot as Snapshot | undefined) ?? null;
    },
  };
}
