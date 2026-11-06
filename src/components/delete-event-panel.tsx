"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(admin)/form-state";

/** Deleting an event: type its web address to confirm. The server checks the rest
 * (permission, and that nobody has registered or been marked present). */
export function DeleteEventPanel({ action, slug }: { action: (prev: FormState, form: FormData) => Promise<FormState>; slug: string }) {
  const [state, run, pending] = useActionState(action, { errors: {} } as FormState);
  return (
    <form action={run} className="space-y-3 border-2 border-clay-deep p-4">
      <h2 className="text-lg font-semibold">Delete this event</h2>
      <p className="text-sm text-ink/70">
        This removes it from the CMS for good; it leaves the site at the next publish. Events people have registered for can&rsquo;t be deleted: hide
        them instead. To confirm, type the web address <code className="bg-ink/10 px-1 font-mono">{slug}</code>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-60 flex-1">
          <span className="font-mono text-xs uppercase tracking-wider text-ink/60">Web address</span>
          <input name="confirm" autoComplete="off" spellCheck={false} className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 font-mono" />
        </label>
        <button type="submit" disabled={pending} className="h-10 bg-clay-deep px-4 text-sm font-medium text-paper transition-colors hover:bg-ink disabled:opacity-60">
          {pending ? "Deleting…" : "Delete event"}
        </button>
      </div>
      {state.message && (
        <p role="alert" className="text-sm text-clay-deep">
          {state.message}
        </p>
      )}
    </form>
  );
}
