import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { dateLabel, deriveStatus } from "@/lib/event-logic";
import { eventCandidate, type EventRow } from "@/lib/snapshot";
import { SnapshotEvent } from "@/lib/contract";

export const metadata = { title: "Events" };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").order("start_date", { ascending: true, nullsFirst: false });
  const rows = (data ?? []) as EventRow[];
  const t = today();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Events</h1>
        <Link href="/events/new" className="inline-flex h-11 items-center bg-ink px-6 font-medium text-paper transition-colors hover:bg-clay-deep">
          New event
        </Link>
      </div>
      {saved && (
        <p role="status" className="border-2 border-ink p-3 text-sm">
          Saved. It goes live on the site when you publish from the dashboard.
        </p>
      )}
      {error && <p role="alert" className="border-2 border-clay-deep p-3 text-sm">Could not load events: {error.message}</p>}
      {rows.length === 0 && !error && <p className="text-ink/60">No events yet.</p>}
      <ul className="divide-y-2 divide-ink border-y-2 border-ink">
        {rows.map((r) => {
          const parsed = SnapshotEvent.safeParse(eventCandidate(r, "https://x.supabase.co"));
          const status = parsed.success ? deriveStatus(parsed.data.date, t, r.status_override) : null;
          return (
            <li key={r.id}>
              <Link href={`/events/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-2 py-4 transition-colors hover:bg-paper-raised">
                <span className="min-w-0 flex-1 font-medium">{r.title}</span>
                <span className="font-mono text-xs uppercase tracking-wider text-ink/60">{parsed.success ? dateLabel(parsed.data.date) : "Needs fixing"}</span>
                <span className="font-mono text-xs uppercase tracking-wider">{status ?? "?"}</span>
                <span className="font-mono text-xs uppercase tracking-wider text-ink/60">reg: {r.apply_mode}</span>
                {r.archived && <span className="bg-ink px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-paper">hidden</span>}
                {!parsed.success && <span className="bg-clay-deep px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-paper">invalid</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
