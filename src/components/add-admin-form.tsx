"use client";

import { useActionState } from "react";
import { ROLES, ROLE_INFO } from "@/lib/roles";
import { addAdminAction, type AdminsState } from "@/app/(admin)/admins/actions";

export function AddAdminForm() {
  const [state, action, pending] = useActionState(addAdminAction, { message: null, ok: false } as AdminsState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 border-2 border-ink p-4">
      <label className="block">
        <span className="font-mono text-xs uppercase tracking-widest text-ink/60">GitHub username</span>
        <input name="username" required placeholder="octocat" autoComplete="off" className="mt-1 block h-11 border-2 border-ink bg-paper px-3" />
      </label>
      <label className="block">
        <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Role</span>
        <select name="role" defaultValue="member" className="mt-1 block h-11 border-2 border-ink bg-paper px-2">
          {[...ROLES].reverse().map((r) => (
            <option key={r} value={r}>
              {ROLE_INFO[r].label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="h-11 bg-ink px-6 font-medium text-paper transition-colors hover:bg-clay-deep disabled:opacity-50">
        {pending ? "Adding…" : "Add"}
      </button>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`w-full text-sm ${state.ok ? "" : "text-clay-deep"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
