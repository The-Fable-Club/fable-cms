"use client";

import { useActionState, useRef, useState } from "react";
import { addOnSpotAction, type ActionState } from "@/app/(admin)/attendance/actions";

export function OnSpotForm({ eventId }: { eventId: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [collegeVal, setCollegeVal] = useState("VIT Chennai");
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const res = await addOnSpotAction(prev, formData);
      if (res.ok && formRef.current) {
        formRef.current.reset();
        setCollegeVal("VIT Chennai");
      }
      return res;
    },
    { ok: false, message: "" }
  );

  const isVit = collegeVal.trim().toLowerCase() === "vit chennai" || collegeVal.trim() === "";

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            College *
          </span>
          <input
            name="college"
            value={collegeVal}
            onChange={(e) => setCollegeVal(e.target.value)}
            required
            placeholder="VIT Chennai"
            className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 font-medium focus:outline-none focus:ring-2 focus:ring-clay"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Registration number *
          </span>
          <input
            name="reg_no"
            required
            placeholder={isVit ? "24BCE1078" : "College ID"}
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-clay"
          />
          <span className="mt-0.5 block font-mono text-[0.65rem] text-ink/50">
            {isVit ? "2 digits, 3 letters, 4 digits (e.g. 24BCE1078)" : "Any format accepted for other institutions"}
          </span>
        </label>

        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Full name *
          </span>
          <input
            name="name"
            required
            placeholder="Student Name"
            autoComplete="off"
            className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 focus:outline-none focus:ring-2 focus:ring-clay"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Department
          </span>
          <input
            name="department"
            placeholder="CSE / SCOPE"
            autoComplete="off"
            className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 focus:outline-none focus:ring-2 focus:ring-clay"
          />
        </label>

        <label className="block">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Year
          </span>
          <input
            name="year"
            placeholder="1st Year"
            autoComplete="off"
            className="mt-1 block h-10 w-full border-2 border-ink bg-paper px-2 focus:outline-none focus:ring-2 focus:ring-clay"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-10 border-2 border-ink bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-clay-deep disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add on-spot student"}
      </button>

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
