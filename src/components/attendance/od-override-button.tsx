"use client";

import { useTransition } from "react";
import { toggleOdOverrideAction } from "@/app/(admin)/attendance/actions";

export function OdOverrideButton({
  rosterId,
  isOverridden,
  studentName,
}: {
  rosterId: number;
  isOverridden: boolean;
  studentName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const nextState = !isOverridden;
      const reason = nextState ? "Manual override by organizer" : undefined;
      await toggleOdOverrideAction(rosterId, nextState, reason);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title={
        isOverridden
          ? `Click to remove manual override for ${studentName}`
          : `Click to manually include ${studentName} in official OD file`
      }
      className={`font-mono text-xs uppercase px-2 py-0.5 border transition-colors ${
        isOverridden
          ? "border-clay-deep bg-clay-deep/15 text-clay-deep hover:bg-clay-deep hover:text-paper"
          : "border-ink/40 bg-paper hover:border-ink hover:bg-paper-raised text-ink"
      } disabled:opacity-50`}
    >
      {isPending ? "…" : isOverridden ? "Exclude from OD" : "Include in OD"}
    </button>
  );
}
