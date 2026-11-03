import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Snapshot } from "@/lib/contract";
import { MIN_SECONDS_BETWEEN_PUBLISHES, type PublishDeps, type RepublishDeps } from "@/lib/publish";
import type { EventRow, MemberRow, QuestionRow } from "@/lib/snapshot";

/** PostgREST / Postgres "table does not exist" (a migration not applied yet). */
export const isMissingTable = (e: { code?: string }) => e.code === "42P01" || e.code === "PGRST205";
/** PostgREST / Postgres "function does not exist" (migration 0009 not applied yet). */
export const isMissingFunction = (e: { code?: string }) => e.code === "42883" || e.code === "PGRST202";

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
      const [events, members, questions] = await Promise.all([
        supabase.from("events").select("*"),
        supabase.from("members").select("*"),
        supabase.from("event_questions").select("id, created_at, event_slug, question, answer, show_on_site, hidden").eq("show_on_site", true),
      ]);
      if (events.error) fail("Could not read events", events.error.message);
      if (members.error) fail("Could not read members", members.error.message);
      // Before migration 0007 the questions table does not exist: publish without an FAQ rather than fail.
      if (questions.error && !isMissingTable(questions.error)) fail("Could not read questions", questions.error.message);
      return {
        events: (events.data ?? []) as EventRow[],
        members: (members.data ?? []) as MemberRow[],
        questions: (questions.error ? [] : (questions.data ?? [])) as QuestionRow[],
      };
    },
    async lastPublishedAt() {
      const { data, error } = await supabase.from("releases").select("published_at").order("id", { ascending: false }).limit(1).maybeSingle();
      if (error) fail("Could not read releases", error.message);
      return data ? new Date(data.published_at) : null;
    },
    async insertRelease({ snapshot, note, publishedBy }) {
      // Locked check-and-insert in the database (0009). Row level security still applies: it runs as the signed-in admin.
      const rpc = await supabase.rpc("publish_release", {
        p_snapshot: snapshot,
        p_note: note,
        p_published_by: publishedBy,
        p_schema_version: snapshot.schema_version,
        p_min_seconds: MIN_SECONDS_BETWEEN_PUBLISHES,
      });
      if (!rpc.error) {
        const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as { release_id: number | string | null; retry_after_seconds: number } | undefined;
        if (!row) return fail("Could not save the release", "no row returned");
        if (row.release_id === null) return { retryAfterSeconds: Math.max(1, row.retry_after_seconds) };
        return { id: Number(row.release_id) };
      }
      if (!isMissingFunction(rpc.error)) return fail("Could not save the release", rpc.error.message);

      // Before 0009: the plain insert (the early check above is then the only limit).
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
