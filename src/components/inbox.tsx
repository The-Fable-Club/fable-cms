import { INBOXES, type InboxTable } from "@/lib/inbox";
import { setStatusAction } from "@/app/(admin)/inbox-actions";

type Row = Record<string, unknown> & { id: number; status: string; notes: string | null; created_at: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export function Inbox({ table, rows, filter }: { table: InboxTable; rows: Row[]; filter?: string }) {
  const cfg = INBOXES[table];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{cfg.title}</h1>
        <a href={`/export/${table}`} className="inline-flex h-11 items-center border-2 border-ink px-6 font-medium transition-colors hover:bg-ink hover:text-paper">
          Download CSV
        </a>
      </div>
      <p className="text-sm text-ink/60">{cfg.intro}</p>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {["all", ...cfg.statuses].map((s) => (
          <a
            key={s}
            href={s === "all" ? `/${table}` : `/${table}?status=${s}`}
            aria-current={(filter ?? "all") === s ? "page" : undefined}
            className="border-2 border-ink px-3 py-1 font-mono text-xs uppercase tracking-wider aria-[current=page]:bg-ink aria-[current=page]:text-paper"
          >
            {s}
          </a>
        ))}
      </nav>
      {rows.length === 0 && <p className="text-ink/60">Nothing here yet.</p>}
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.id} className="border-2 border-ink p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">{String(r.name)}</p>
              <p className="font-mono text-xs uppercase tracking-wider text-ink/60">{when(r.created_at)} IST</p>
            </div>
            <p className="mt-1 text-sm text-ink/70">
              {String(r.reg_no)} · <a className="underline underline-offset-2" href={`mailto:${String(r.email)}`}>{String(r.email)}</a> · {String(r.department)} · {String(r.year)}
              {table === "registrations" && <> · event <strong>{String(r.event_slug)}</strong></>}
              {table === "registrations" && r.phone ? <> · {String(r.phone)}</> : null}
            </p>
            {table === "applications" && (
              <div className="mt-3 text-sm">
                <p>
                  <span className="font-mono text-xs uppercase tracking-wider text-ink/60">Level</span> {String(r.level)}
                  {Array.isArray(r.tracks) && r.tracks.length > 0 && <> · {(r.tracks as string[]).join(", ")}</>}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{String(r.why)}</p>
              </div>
            )}
            <form action={setStatusAction} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="table" value={table} />
              <input type="hidden" name="id" value={r.id} />
              <label className="block">
                <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Status</span>
                <select name="status" defaultValue={r.status} className="mt-1 block h-10 border-2 border-ink bg-paper px-2">
                  {cfg.statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block min-w-48 flex-1">
                <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Notes (only you see these)</span>
                <input name="notes" defaultValue={r.notes ?? ""} maxLength={500} className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2" />
              </label>
              <button type="submit" className="h-10 bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-clay-deep">
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
