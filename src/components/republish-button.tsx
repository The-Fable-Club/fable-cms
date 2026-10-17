"use client";

import { useActionState } from "react";
import { republishAction, type PublishState } from "@/app/(admin)/actions";

const initial: PublishState = { result: null, at: 0 };

/** Owner only: roll back by publishing an old release again. */
export function RepublishButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState(republishAction, initial);
  const r = state.result;
  return (
    <form action={action} className="inline-flex flex-col items-start gap-1" onSubmit={(e) => { if (!confirm(`Publish release #${id} again? The live site will be rebuilt from it.`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="h-9 border-2 border-ink px-3 text-sm font-medium transition-colors hover:bg-ink hover:text-paper disabled:opacity-50">
        {pending ? "Publishing…" : "Publish this again"}
      </button>
      {r?.ok && <span role="status" className="text-xs">Saved as release #{r.releaseId}. {r.deploy === "triggered" ? "Rebuilding." : r.error}</span>}
      {r && !r.ok && (
        <span role="alert" className="text-xs text-clay-deep">
          {r.reason === "rate_limited" ? `Wait ${r.retryAfterSeconds}s.` : r.reason === "error" ? r.message : "That release can no longer be read by the site."}
        </span>
      )}
    </form>
  );
}
