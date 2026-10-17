"use client";

import { useActionState } from "react";
import { publishAction, type PublishState } from "@/app/(admin)/actions";

const initial: PublishState = { result: null, at: 0 };

export function PublishPanel({ unpublished, hookConfigured }: { unpublished: number; hookConfigured: boolean }) {
  const [state, action, pending] = useActionState(publishAction, initial);
  const r = state.result;

  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block max-w-md">
        <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Note (optional)</span>
        <input
          name="note"
          maxLength={200}
          placeholder="What changed?"
          className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 outline-none focus:ring-2 focus:ring-clay"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-11 bg-ink px-6 font-medium text-paper transition-colors hover:bg-clay-deep disabled:cursor-wait disabled:opacity-50"
      >
        {pending ? "Publishing…" : unpublished > 0 ? `Publish ${unpublished} change${unpublished === 1 ? "" : "s"}` : "Publish"}
      </button>
      {!hookConfigured && (
        <p className="text-sm text-clay-deep">The deploy hook is not configured: publishing saves a release but does not rebuild the site.</p>
      )}

      {r?.ok && (
        <div role="status" className="border-2 border-ink p-4 text-sm">
          <p className="font-medium">
            Release #{r.releaseId} saved: {r.counts.events} event{r.counts.events === 1 ? "" : "s"}, {r.counts.members} member{r.counts.members === 1 ? "" : "s"}.
          </p>
          <p className="mt-1">
            {r.deploy === "triggered" && "The site is rebuilding. The new content is live in about a minute."}
            {r.deploy !== "triggered" && <span className="text-clay-deep">{r.error}</span>}
          </p>
        </div>
      )}
      {r && !r.ok && r.reason === "rate_limited" && (
        <p role="alert" className="border-2 border-ink p-4 text-sm">
          You just published. Wait {r.retryAfterSeconds}s before publishing again.
        </p>
      )}
      {r && !r.ok && r.reason === "invalid" && (
        <div role="alert" className="border-2 border-clay-deep p-4 text-sm">
          <p className="font-medium">Nothing was published. Fix these first:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {r.problems.map((p, i) => (
              <li key={i}>
                <strong>{p.label}</strong> — {p.field}: {p.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r && !r.ok && r.reason === "error" && (
        <p role="alert" className="border-2 border-clay-deep p-4 text-sm">
          Something went wrong: {r.message}
        </p>
      )}
    </form>
  );
}
