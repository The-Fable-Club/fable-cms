import { PublishPanel } from "@/components/publish-panel";
import { requireAdmin } from "@/lib/auth";
import { can, ROLE_INFO } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

const CONTENT_TABLES = ["events", "members", "aims", "club_settings"] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const admin = await requireAdmin();
  const { error: notice } = await searchParams;
  // The user's own session: row level security applies to every query below.
  const supabase = await createClient();

  const count = async (table: string, filter?: { col: string; gt?: string; eq?: string }) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter?.gt) q = q.gt(filter.col, filter.gt);
    if (filter?.eq) q = q.eq(filter.col, filter.eq);
    const { count: n } = await q;
    return n ?? 0;
  };

  const { data: last } = await supabase
    .from("releases")
    .select("id, published_at, published_by")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [events, members, aims, newApps, newRegs, ...changed] = await Promise.all([
    count("events"),
    count("members"),
    count("aims"),
    count("applications", { col: "status", eq: "new" }),
    count("registrations", { col: "status", eq: "new" }),
    // "Unpublished changes": rows edited since the last release (or everything, before the first one).
    ...CONTENT_TABLES.map((t) => (last ? count(t, { col: "updated_at", gt: last.published_at }) : count(t))),
  ]);
  const unpublished = changed.reduce((a, b) => a + b, 0);

  const cards = [
    ...(can(admin.role, "edit_draft_events") ? [{ label: "Events", value: events }] : []),
    ...(can(admin.role, "manage_members") ? [{ label: "Members", value: members }, { label: "Aims", value: aims }] : []),
    { label: "New applications", value: newApps },
    { label: "New registrations", value: newRegs },
  ];

  return (
    <div className="space-y-10">
      {notice === "not-allowed" && (
        <p role="alert" className="border-2 border-clay-deep p-3 text-sm">
          Your level ({ROLE_INFO[admin.role].label}) can&apos;t open that page.
        </p>
      )}
      <section>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-ink/60">
          Signed in as {ROLE_INFO[admin.role].label}. {ROLE_INFO[admin.role].summary}
        </p>
        <dl className="mt-6 grid gap-px border-2 border-ink bg-ink sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => (
            <div key={c.label} className="bg-paper p-5">
              <dt className="font-mono text-xs uppercase tracking-widest text-ink/60">{c.label}</dt>
              <dd className="mt-2 text-4xl font-semibold tabular-nums">{c.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {can(admin.role, "publish") && (
      <section className="border-2 border-ink p-6">
        <h2 className="text-xl font-semibold">Publishing</h2>
        <p className="mt-2 text-sm text-ink/70">
          {last
            ? `Last published ${new Date(last.published_at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata" })} IST by @${last.published_by}.`
            : "Nothing has been published yet."}{" "}
          <strong className="text-ink">{unpublished}</strong> {unpublished === 1 ? "row has" : "rows have"} changed
          since then.
        </p>
        <PublishPanel unpublished={unpublished} hookConfigured={Boolean(process.env.VERCEL_DEPLOY_HOOK_URL?.trim())} />
      </section>
      )}
    </div>
  );
}
