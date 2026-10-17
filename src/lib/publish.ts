import type { Snapshot } from "@/lib/contract";
import { buildSnapshot, type EventRow, type MemberRow, type Problem } from "@/lib/snapshot";

/** Everything publish() touches, injected so the logic can be tested without a network. */
export type PublishDeps = {
  supabaseUrl: string;
  now: () => Date;
  loadRows: () => Promise<{ events: EventRow[]; members: MemberRow[] }>;
  lastPublishedAt: () => Promise<Date | null>;
  insertRelease: (r: { snapshot: Snapshot; note: string | null; publishedBy: string }) => Promise<{ id: number }>;
  /** null = no deploy hook configured. */
  hookUrl: string | null;
  fetchHook: (url: string) => Promise<{ status: number }>;
  recordDeploy: (id: number, state: DeployState) => Promise<void>;
};

export type DeployState = "triggered" | "failed" | "not_configured";

export type PublishResult =
  | { ok: true; releaseId: number; deploy: DeployState; counts: { events: number; members: number }; error?: string }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "invalid"; problems: Problem[] }
  | { ok: false; reason: "error"; message: string };

export const MIN_SECONDS_BETWEEN_PUBLISHES = 60;

/**
 * Publish = validate the whole site, save it as a release, then ask Vercel to
 * rebuild. The release is saved BEFORE the rebuild is requested, so a failed
 * request never loses the content: use "Retry deploy" and nothing is lost.
 */
export async function publish(deps: PublishDeps, input: { by: string; note?: string | null }): Promise<PublishResult> {
  try {
    const last = await deps.lastPublishedAt();
    if (last) {
      const wait = MIN_SECONDS_BETWEEN_PUBLISHES - (deps.now().getTime() - last.getTime()) / 1000;
      if (wait > 0) return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.ceil(wait) };
    }

    const rows = await deps.loadRows();
    const built = buildSnapshot(rows, { supabaseUrl: deps.supabaseUrl, now: deps.now() });
    if (!built.ok) return { ok: false, reason: "invalid", problems: built.problems };

    const note = input.note?.trim() || null;
    const { id } = await deps.insertRelease({ snapshot: built.snapshot, note, publishedBy: input.by });
    const counts = { events: built.snapshot.events.length, members: built.snapshot.members.length };

    const deploy = await triggerDeploy(deps, id);
    return { ok: true, releaseId: id, counts, ...deploy };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Ask Vercel to rebuild and remember the outcome on the release. Used by Publish and by "Retry deploy". */
export async function triggerDeploy(deps: Pick<PublishDeps, "hookUrl" | "fetchHook" | "recordDeploy">, releaseId: number) {
  let deploy: DeployState;
  let error: string | undefined;
  if (!deps.hookUrl) {
    deploy = "not_configured";
    error = "The deploy hook is not set up, so the site was not rebuilt. The release is saved.";
  } else {
    try {
      const res = await deps.fetchHook(deps.hookUrl);
      deploy = res.status >= 200 && res.status < 300 ? "triggered" : "failed";
      if (deploy === "failed") error = `Vercel answered ${res.status}. The release is saved; retry the deploy.`;
    } catch (e) {
      deploy = "failed";
      error = `Could not reach Vercel (${e instanceof Error ? e.message : "network error"}). The release is saved; retry the deploy.`;
    }
  }
  try {
    await deps.recordDeploy(releaseId, deploy);
  } catch {
    /* the outcome is still returned to the person; only the stored label is missing */
  }
  return { deploy, ...(error ? { error } : {}) };
}
