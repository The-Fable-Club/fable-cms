import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MemberRow } from "@/lib/snapshot";

export const metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").select("*").eq("group", "Member").order("position").order("name");
  const rows = (data ?? []) as MemberRow[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Members</h1>
        <Link href="/members/new" className="inline-flex h-11 items-center bg-ink px-6 font-medium text-paper transition-colors hover:bg-clay-deep">
          New member
        </Link>
      </div>
      <p className="text-sm text-ink/60">These are the general members on the site&apos;s Members page. Faculty and the board are kept in the site&apos;s code, not here.</p>
      {saved && (
        <p role="status" className="border-2 border-ink p-3 text-sm">
          Saved. It goes live on the site when you publish from the dashboard.
        </p>
      )}
      {error && <p role="alert" className="border-2 border-clay-deep p-3 text-sm">Could not load members: {error.message}</p>}
      {rows.length === 0 && !error && <p className="text-ink/60">No members yet.</p>}
      <ul className="divide-y-2 divide-ink border-y-2 border-ink">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/members/${r.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-2 py-4 transition-colors hover:bg-paper-raised">
              <span className="min-w-0 flex-1 font-medium">{r.name}</span>
              <span className="font-mono text-xs uppercase tracking-wider text-ink/60">{r.role || "Member"}</span>
              <span className="font-mono text-xs uppercase tracking-wider text-ink/60">{r.department}</span>
              {r.archived && <span className="bg-ink px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-paper">hidden</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
