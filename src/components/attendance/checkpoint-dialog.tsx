"use client";

import { useState, useTransition } from "react";
import { saveCheckpointAction, deleteCheckpointAction, type ActionState } from "@/app/(admin)/attendance/actions";

export type CheckpointItem = {
  id: number;
  title: string;
  opens_at: string;
  closes_at: string;
  needed_for_od: boolean;
};

// Formats an ISO string (e.g. 2026-10-22T09:30:00+05:30) for <input type="datetime-local" />
function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // Format to local date time format YYYY-MM-DDTHH:mm using Asia/Kolkata timezone
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    return iso.slice(0, 16);
  }
}

export function CheckpointDialog({
  eventId,
  checkpoint,
  onClose,
}: {
  eventId: number;
  checkpoint?: CheckpointItem | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultOpens = checkpoint ? toDatetimeLocal(checkpoint.opens_at) : "";
  const defaultCloses = checkpoint ? toDatetimeLocal(checkpoint.closes_at) : "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res: ActionState = await saveCheckpointAction({ ok: false, message: "" }, formData);
      if (res.ok) {
        onClose();
      } else {
        setError(res.message);
      }
    });
  }

  function handleDelete() {
    if (!checkpoint) return;
    if (!confirm(`Delete checkpoint "${checkpoint.title}"? Any existing marks for it will be removed.`)) return;
    startTransition(async () => {
      const res = await deleteCheckpointAction(checkpoint.id);
      if (res.ok) {
        onClose();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg border-4 border-ink bg-paper p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 border-2 border-ink px-2.5 py-1 font-mono text-xs uppercase hover:bg-clay hover:text-ink"
        >
          Close [Esc]
        </button>

        <h3 className="font-display text-2xl font-semibold">
          {checkpoint ? "Edit Checkpoint" : "Add Checkpoint"}
        </h3>
        <p className="mt-1 text-sm text-ink/60">
          Configure time windows and whether this check-in is required for OD eligibility.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input type="hidden" name="event_id" value={eventId} />
          {checkpoint && <input type="hidden" name="checkpoint_id" value={checkpoint.id} />}

          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
              Checkpoint Title *
            </span>
            <input
              name="title"
              required
              defaultValue={checkpoint?.title || ""}
              placeholder="e.g. Arrival Checkin, Mid-event, Exit"
              className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
                Opens At (IST) *
              </span>
              <input
                type="datetime-local"
                name="opens_at"
                required
                defaultValue={defaultOpens}
                className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </label>

            <label className="block">
              <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
                Closes At (IST) *
              </span>
              <input
                type="datetime-local"
                name="closes_at"
                required
                defaultValue={defaultCloses}
                className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 focus:outline-none focus:ring-2 focus:ring-clay"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer border-2 border-ink p-3 hover:bg-paper-raised">
            <input
              type="checkbox"
              name="needed_for_od"
              value="true"
              defaultChecked={checkpoint ? checkpoint.needed_for_od : true}
              className="size-4 border-2 border-ink accent-ink"
            />
            <div>
              <span className="font-medium text-sm">Mandatory for OD certificate</span>
              <p className="text-xs text-ink/60">Students must have this checkpoint marked to be eligible for On-Duty.</p>
            </div>
          </label>

          {error && (
            <p role="alert" className="border-2 border-clay-deep p-2 text-sm text-clay-deep">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between pt-2">
            {checkpoint ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="border-2 border-clay-deep px-3 py-1.5 font-mono text-xs uppercase text-clay-deep hover:bg-clay-deep hover:text-paper"
              >
                Delete
              </button>
            ) : <span />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border-2 border-ink px-4 py-1.5 text-sm hover:bg-paper-raised"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="border-2 border-ink bg-ink px-5 py-1.5 text-sm font-medium text-paper hover:bg-clay-deep disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save Checkpoint"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
