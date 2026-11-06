"use client";

import { useActionState, useRef } from "react";
import { uploadRosterAction, type ActionState } from "@/app/(admin)/attendance/actions";

export function RosterUploadForm({ eventId }: { eventId: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const res = await uploadRosterAction(prev, formData);
      if (res.ok && formRef.current) {
        formRef.current.reset();
      }
      return res;
    },
    { ok: false, message: "" }
  );

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.ods,.csv,.xls"
          required
          disabled={isPending}
          className="text-sm text-ink file:mr-3 file:border-2 file:border-ink file:bg-paper file:px-3 file:py-1.5 file:font-mono file:text-xs file:uppercase file:tracking-wider file:text-ink hover:file:bg-paper-raised"
        />
        <button
          type="submit"
          disabled={isPending}
          className="h-10 border-2 border-ink bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-clay-deep disabled:opacity-50"
        >
          {isPending ? "Importing…" : "Import Spreadsheet"}
        </button>
      </div>

      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`border-2 p-2 text-sm ${
            state.ok ? "border-ink bg-paper text-ink" : "border-clay-deep bg-paper text-clay-deep"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
