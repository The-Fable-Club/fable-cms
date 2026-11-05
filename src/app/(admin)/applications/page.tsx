import Link from "next/link";
import { requireCan } from "@/lib/auth";
import { can } from "@/lib/roles";
import {
  APP_STATUSES,
  CURRENT_INTAKE,
  REPLIES,
  STATUS_LABEL,
  TEAMS,
  countByStatus,
  filterQuery,
  matches,
  parseFilters,
  replyMailto,
  teamAnswers,
  whatsappLink,
  type Application,
  type ReplyKind,
} from "@/lib/applications";
import { createClient } from "@/lib/supabase/server";
import { setStatusAction } from "../inbox-actions";

export const metadata = { title: "Applications" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const label = "font-mono text-xs uppercase tracking-wider text-ink/60";
const chip = "border-2 border-ink px-3 py-1 font-mono text-xs uppercase tracking-wider aria-[current=page]:bg-ink aria-[current=page]:text-paper";
const tone: Record<string, string> = {
  new: "bg-clay-deep text-paper", // needs someone to read it
  reviewed: "border-2 border-ink text-ink",
  shortlisted: "bg-clay text-ink",
  accepted: "bg-ink text-paper",
  rejected: "bg-ink/15 text-ink",
};

export default async function Applications({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; team?: string; intake?: string; q?: string }>;
}) {
  const me = await requireCan("read_signups");
  const triage = can(me.role, "triage_signups");
  const f = parseFilters(await searchParams);

  const supabase = await createClient();
  const { data, error } = await supabase.from("applications").select("*").order("created_at", { ascending: false }).limit(2000);
  const all = (data ?? []) as Application[];
  const counts = countByStatus(all, f);
  const rows = all.filter((a) => matches(a, f));
  const intakes = [...new Set([CURRENT_INTAKE, ...all.map((a) => a.intake ?? "")].filter(Boolean))];
  const exportHref = `/export/applications${filterQuery(f)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Applications</h1>
        <a href={exportHref} className="inline-flex h-11 items-center border-2 border-ink px-6 font-medium transition-colors hover:bg-ink hover:text-paper">
          Download CSV (this view)
        </a>
      </div>
      <p className="text-sm text-ink/60">
        From the Join page. The steps: <strong>New</strong> → <strong>Reviewed</strong> → <strong>Invited to chat</strong> → <strong>Accepted</strong> or{" "}
        <strong>Not selected</strong>. Applicants are promised a reply within a week. Reply drafts open in your own mail app with the club mailbox copied in.
        {!triage && " You can read applications; changing a step needs Admin."}
      </p>
      {error && (
        <p role="alert" className="border-2 border-clay-deep p-3 text-sm">
          Could not load applications: {error.message}
        </p>
      )}

      {/* filters: plain GET form, so a view can be bookmarked or shared */}
      <form method="get" className="flex flex-wrap items-end gap-3 border-2 border-ink p-4">
        {f.status !== "all" && <input type="hidden" name="status" value={f.status} />}
        <label className="block min-w-52 flex-1">
          <span className={label}>Search name, reg. no., email or department</span>
          <input name="q" defaultValue={f.q} className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2" />
        </label>
        <label className="block">
          <span className={label}>Team</span>
          <select name="team" defaultValue={f.team} className="mt-1 block h-10 border-2 border-ink bg-paper px-2">
            <option value="all">All teams</option>
            {TEAMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Intake</span>
          <select name="intake" defaultValue={f.intake} className="mt-1 block h-10 border-2 border-ink bg-paper px-2">
            {intakes.map((i) => (
              <option key={i} value={i}>
                {i === "pre-launch" ? "pre-launch (trials)" : i}
              </option>
            ))}
            <option value="all">All intakes</option>
          </select>
        </label>
        <button type="submit" className="h-10 bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-clay-deep">
          Apply filters
        </button>
        {(f.q || f.team !== "all" || f.intake !== CURRENT_INTAKE) && (
          <Link href={`/applications${filterQuery({ ...f, q: "", team: "all", intake: CURRENT_INTAKE })}`} className="h-10 px-2 text-sm leading-10 underline underline-offset-4">
            Clear
          </Link>
        )}
      </form>

      <nav aria-label="Filter by step" className="flex flex-wrap gap-2">
        {(["all", ...APP_STATUSES] as const).map((s) => (
          <Link key={s} href={`/applications${filterQuery(f, { status: s })}`} aria-current={f.status === s ? "page" : undefined} className={chip}>
            {s === "all" ? "All" : STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </nav>

      {rows.length === 0 && !error && <p className="text-ink/60">Nothing here.</p>}

      <ul className="space-y-4">
        {rows.map((a) => {
          const wa = whatsappLink(a.phone);
          const reply = (a.status in REPLIES ? a.status : null) as ReplyKind | null;
          return (
            <li key={a.id} id={`a-${a.id}`} className="border-2 border-ink p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="flex flex-wrap items-center gap-3 text-lg font-semibold">
                  {a.name}
                  <span className={`px-2 py-0.5 font-mono text-[11px] font-normal uppercase tracking-wider ${tone[a.status] ?? "bg-ink/10"}`}>
                    {STATUS_LABEL[a.status as keyof typeof STATUS_LABEL] ?? a.status}
                  </span>
                </p>
                <p className={label}>{when(a.created_at)} IST</p>
              </div>
              <p className="mt-1 text-sm text-ink/70">
                {a.reg_no} · {a.department} · {a.year} · <a className="underline underline-offset-2" href={`mailto:${a.email}`}>{a.email}</a>
                {a.phone && (
                  <>
                    {" "}· <a className="underline underline-offset-2" href={`tel:${a.phone.replace(/[^\d+]/g, "")}`}>{a.phone}</a>
                  </>
                )}
                {wa && (
                  <>
                    {" "}·{" "}
                    <a className="underline underline-offset-2" href={wa} target="_blank" rel="noopener noreferrer">
                      WhatsApp
                    </a>
                  </>
                )}
              </p>

              <div className="mt-3 grid gap-3 text-sm md:grid-cols-[12rem_1fr]">
                <p className={label}>Team</p>
                <p>{a.team ?? "—"}{a.intake && a.intake !== CURRENT_INTAKE ? <span className="text-ink/60"> · intake {a.intake}</span> : null}</p>
                {/* team questions (migration 0016): the question is long, so it gets the full width */}
                {teamAnswers(a).map((x, i) => (
                  <div key={i} className="border-l-2 border-ink/15 pl-3 md:col-span-2">
                    <p className="text-ink/60">{x.q}</p>
                    <p className="mt-1 whitespace-pre-wrap">{x.a}</p>
                  </div>
                ))}
                {(
                  [
                    ["Wants to build or learn", a.build],
                    ["Why they want to join", a.why],
                    ["Short task", a.task],
                    // older applications asked for a level and tracks instead
                    ["Level (old form)", a.level ? `${a.level}${a.tracks?.length ? ` · ${a.tracks.join(", ")}` : ""}` : null],
                  ] as const
                ).map(([k, v]) =>
                  v ? (
                    <div key={k} className="contents">
                      <p className={label}>{k}</p>
                      <p className="whitespace-pre-wrap">{v}</p>
                    </div>
                  ) : null,
                )}
              </div>

              {triage ? (
                <form action={setStatusAction} className="mt-4 flex flex-wrap items-end gap-3 border-t-2 border-ink/10 pt-4">
                  <input type="hidden" name="table" value="applications" />
                  <input type="hidden" name="id" value={a.id} />
                  <label className="block">
                    <span className={label}>Step</span>
                    <select name="status" defaultValue={a.status} className="mt-1 block h-10 border-2 border-ink bg-paper px-2">
                      {APP_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-48 flex-1">
                    <span className={label}>Notes (only the board sees these)</span>
                    <input name="notes" defaultValue={a.notes ?? ""} maxLength={500} className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2" />
                  </label>
                  <button type="submit" className="h-10 bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-clay-deep">
                    Save
                  </button>
                  {reply && (
                    <a
                      href={replyMailto(reply, a)}
                      className="inline-flex h-10 items-center border-2 border-ink px-4 text-sm font-medium transition-colors hover:bg-ink hover:text-paper"
                    >
                      Draft the {REPLIES[reply].label.toLowerCase()}
                    </a>
                  )}
                </form>
              ) : (
                <p className="mt-4 text-sm text-ink/60">
                  Step: <strong>{STATUS_LABEL[a.status as keyof typeof STATUS_LABEL] ?? a.status}</strong>
                  {a.notes ? <> · {a.notes}</> : null}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
