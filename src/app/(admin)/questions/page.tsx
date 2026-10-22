import Link from "next/link";
import { requireCan } from "@/lib/auth";
import { mailConfigured } from "@/lib/mail";
import { QUESTION_FILTERS, answerEmail, matchesFilter, type Question, type QuestionFilter } from "@/lib/questions";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { deleteQuestionAction, emailAnswerAction, markEmailedAction, saveAnswerAction } from "./actions";

export const metadata = { title: "Questions" };

const LABEL: Record<QuestionFilter, string> = { new: "New", answered: "Answered", "on-site": "On the site", hidden: "Hidden", all: "All" };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const box = "mt-1 block w-full border-2 border-ink bg-paper px-3 py-2";

export default async function Questions({ searchParams }: { searchParams: Promise<{ filter?: string; msg?: string }> }) {
  const me = await requireCan("read_questions");
  const { filter: f, msg } = await searchParams;
  const filter = (QUESTION_FILTERS as readonly string[]).includes(f ?? "") ? (f as QuestionFilter) : "new";
  const answer = can(me.role, "answer_questions");
  const moderate = can(me.role, "moderate_questions");

  const supabase = await createClient();
  const { data, error } = await supabase.from("event_questions").select("*").order("created_at", { ascending: false }).limit(500);
  const all = (data ?? []) as Question[];
  const rows = all.filter((q) => matchesFilter(q, filter));
  // Event titles (members cannot read events; they see the web address instead).
  const { data: evs } = await supabase.from("events").select("slug, title");
  const title = new Map((evs ?? []).map((e) => [e.slug as string, e.title as string]));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Questions</h1>
      <p className="text-sm text-ink/60">
        Asked under events on the site. Nothing here is public until an admin ticks <strong>Show on the site</strong> and someone publishes.
        {moderate && !mailConfigured() && " Email sending is not set up, so answers are emailed by hand (mailto link), then marked as emailed."}
      </p>
      {msg && (
        <p role="status" className="border-2 border-ink p-3 text-sm">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="border-2 border-clay-deep p-3 text-sm">
          Could not load questions: {error.message}
        </p>
      )}
      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {QUESTION_FILTERS.map((x) => (
          <Link
            key={x}
            href={`/questions?filter=${x}`}
            aria-current={filter === x ? "page" : undefined}
            className="border-2 border-ink px-3 py-1 font-mono text-xs uppercase tracking-wider aria-[current=page]:bg-ink aria-[current=page]:text-paper"
          >
            {LABEL[x]} ({all.filter((q) => matchesFilter(q, x)).length})
          </Link>
        ))}
      </nav>
      {rows.length === 0 && !error && <p className="text-ink/60">Nothing here.</p>}

      <ul className="space-y-4">
        {rows.map((q) => {
          const mail = q.email && q.answer ? answerEmail(q, title.get(q.event_slug) ?? q.event_slug, `https://www.thefableclub.com/events/${q.event_slug}`) : null;
          return (
            <li key={q.id} id={`q-${q.id}`} className="border-2 border-ink p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{title.get(q.event_slug) ?? q.event_slug}</span>
                <span className="font-mono text-xs uppercase tracking-wider text-ink/60">{when(q.created_at)} IST</span>
              </div>
              <p className="mt-1 text-xs text-ink/60">
                {q.name ? `From ${q.name}` : "Anonymous"}
                {q.email ? " · wants the answer by email" : q.emailed_at ? ` · answer emailed ${when(q.emailed_at)}` : ""}
                {q.answered_by && ` · answered by @${q.answered_by}`}
                {q.show_on_site && " · shown on the site"}
                {q.hidden && " · hidden"}
              </p>

              {!answer ? (
                <div className="mt-3 space-y-2">
                  <p className="whitespace-pre-wrap">{q.question}</p>
                  {q.answer && <p className="whitespace-pre-wrap border-l-4 border-clay pl-3 text-ink/80">{q.answer}</p>}
                </div>
              ) : (
                <form action={saveAnswerAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="filter" value={filter} />
                  <label className="block">
                    <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Question (you can tidy the wording before it is shown)</span>
                    <textarea name="question" defaultValue={q.question} rows={2} maxLength={500} className={box} />
                  </label>
                  <label className="block">
                    <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Answer</span>
                    <textarea name="answer" defaultValue={q.answer ?? ""} rows={3} maxLength={2000} className={box} />
                  </label>
                  {moderate && (
                    <div className="flex flex-wrap gap-6 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="show_on_site" defaultChecked={q.show_on_site} className="size-5 accent-[var(--color-clay-deep)]" />
                        Show on the site (as this event&apos;s FAQ)
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="hidden" defaultChecked={q.hidden} className="size-5 accent-[var(--color-clay-deep)]" />
                        Hide (spam or not useful)
                      </label>
                    </div>
                  )}
                  <button type="submit" className="h-10 bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-clay-deep">
                    Save
                  </button>
                </form>
              )}

              {moderate && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink/20 pt-3 text-sm">
                  {q.email && q.answer?.trim() && !q.hidden && (
                    <>
                      <form action={emailAnswerAction}>
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="filter" value={filter} />
                        <button type="submit" className="h-9 border-2 border-ink px-3 hover:bg-ink hover:text-paper">
                          Email the answer
                        </button>
                      </form>
                      {mail && !mailConfigured() && (
                        <>
                          <a
                            className="underline underline-offset-4 hover:text-clay-deep"
                            href={`mailto:${q.email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.text)}`}
                          >
                            Open in my email app
                          </a>
                          <form action={markEmailedAction}>
                            <input type="hidden" name="id" value={q.id} />
                            <input type="hidden" name="filter" value={filter} />
                            <button type="submit" className="underline underline-offset-4 hover:text-clay-deep">
                              Mark as emailed
                            </button>
                          </form>
                        </>
                      )}
                    </>
                  )}
                  <form action={deleteQuestionAction} className="ml-auto">
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="filter" value={filter} />
                    <button type="submit" className="text-clay-deep underline underline-offset-4">
                      Delete for good
                    </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
