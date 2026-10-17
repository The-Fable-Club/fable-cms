import { requireCan } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { RepublishButton } from "@/components/republish-button";
import { retryDeployAction } from "../actions";

export const metadata = { title: "Releases" };

type Release = { id: number; published_at: string; published_by: string; note: string | null; deploy_state: string; snapshot: { events?: unknown[]; members?: unknown[] } };

const stateText: Record<string, string> = {
  triggered: "rebuild requested",
  failed: "rebuild request FAILED",
  not_configured: "not rebuilt (no deploy hook)",
};

export default async function Releases() {
  const admin = await requireCan("view_releases");
  const supabase = await createClient();
  const { data, error } = await supabase.from("releases").select("id, published_at, published_by, note, deploy_state, snapshot").order("id", { ascending: false }).limit(50);
  const rows = (data ?? []) as Release[];
  const owner = can(admin.role, "rollback");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Releases</h1>
      <p className="text-sm text-ink/60">Every publish is saved here. The newest release is what the site is built from. History is never rewritten: a rollback publishes an old release again as a new one.</p>
      {error && <p role="alert" className="border-2 border-clay-deep p-3 text-sm">Could not load releases: {error.message}</p>}
      {rows.length === 0 && !error && <p className="text-ink/60">Nothing has been published yet.</p>}
      <ul className="divide-y-2 divide-ink border-y-2 border-ink">
        {rows.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-4">
            <span className="w-16 font-mono text-sm">#{r.id}</span>
            <span className="min-w-48 flex-1 text-sm">
              {new Date(r.published_at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST · @{r.published_by}
              {r.note && <span className="block text-ink/60">{r.note}</span>}
            </span>
            <span className="text-sm text-ink/70">
              {r.snapshot.events?.length ?? 0} events · {r.snapshot.members?.length ?? 0} members
            </span>
            <span className={`font-mono text-xs uppercase tracking-wider ${r.deploy_state === "failed" ? "text-clay-deep" : "text-ink/60"}`}>{stateText[r.deploy_state] ?? r.deploy_state}</span>
            {i === 0 && <span className="bg-ink px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-paper">live</span>}
            {owner && (
              <span className="flex items-center gap-3">
                {r.deploy_state !== "triggered" && (
                  <form action={retryDeployAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="h-9 bg-ink px-3 text-sm font-medium text-paper transition-colors hover:bg-clay-deep">
                      Retry rebuild
                    </button>
                  </form>
                )}
                {i !== 0 && <RepublishButton id={r.id} />}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
