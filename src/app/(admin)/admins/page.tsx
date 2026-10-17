import { AddAdminForm } from "@/components/add-admin-form";
import { requireOwner } from "@/lib/auth";
import { ROLES, ROLE_INFO, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { changeRoleAction, removeAdminAction } from "./actions";

export const metadata = { title: "People" };

type Row = { github_username: string; role: Role; added_by: string | null; added_at: string };

export default async function Admins() {
  const me = await requireOwner();
  const supabase = await createClient();
  const { data } = await supabase.from("admins").select("*").order("added_at");
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">People</h1>
      <p className="text-sm text-ink/60">
        Only people listed here can sign in to the CMS. Being in the GitHub organisation or on the repository does not give access. Owners also manage this list.
      </p>
      <ul className="grid gap-px border-2 border-ink bg-ink text-sm sm:grid-cols-2">
        {[...ROLES].reverse().map((r) => (
          <li key={r} className="bg-paper p-3">
            <strong>{ROLE_INFO[r].label}</strong>
            <span className="block text-ink/70">{ROLE_INFO[r].summary}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink/60">Each level includes everything the levels below it can do.</p>
      <AddAdminForm />
      <ul className="divide-y-2 divide-ink border-y-2 border-ink">
        {rows.map((r) => (
          <li key={r.github_username} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-4">
            <span className="min-w-40 flex-1 font-medium">
              @{r.github_username}
              {r.github_username === me.username && <span className="ml-2 text-xs text-ink/50">(you)</span>}
            </span>
            <span className="text-xs text-ink/60">added by {r.added_by ?? "?"}</span>
            {r.github_username === me.username ? (
              <span className="bg-ink px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-paper">{r.role}</span>
            ) : (
              <>
                <form action={changeRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="username" value={r.github_username} />
                  <select name="role" defaultValue={r.role} aria-label={`Role of ${r.github_username}`} className="h-9 border-2 border-ink bg-paper px-2 text-sm">
                    {[...ROLES].reverse().map((x) => (
                      <option key={x} value={x}>
                        {ROLE_INFO[x].label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="h-9 border-2 border-ink px-3 text-sm hover:bg-ink hover:text-paper">
                    Change
                  </button>
                </form>
              <form action={removeAdminAction}>
                <input type="hidden" name="username" value={r.github_username} />
                <button type="submit" className="h-9 px-3 text-sm underline underline-offset-4 hover:text-clay-deep">
                  Remove
                </button>
              </form>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
