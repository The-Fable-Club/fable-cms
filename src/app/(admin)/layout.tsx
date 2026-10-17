import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

// Everything inside (admin) requires a signed-in admin, checked here on the
// server for every request (the proxy only does a first, cheap redirect).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-4 border-b-2 border-ink px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">Fable CMS</span>
          <span className="font-mono text-xs uppercase tracking-widest text-ink/50">thefableclub.com</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm">
            {admin.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={admin.avatar} alt="" className="size-7 rounded-full border border-ink/20" />
            )}
            <span className="font-medium">@{admin.username}</span>
            <span className="bg-ink px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-paper">
              {admin.role}
            </span>
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm underline underline-offset-4 hover:text-clay-deep">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <nav aria-label="Sections" className="flex flex-wrap gap-x-6 gap-y-1 border-b-2 border-ink px-6 py-2 text-sm font-medium">
        {[
          ["/", "Dashboard"],
          ["/events", "Events"],
          ["/members", "Members"],
          ["/applications", "Applications"],
          ["/registrations", "Registrations"],
          ["/releases", "Releases"],
          ...(admin.role === "owner" ? [["/admins", "People"]] : []),
        ].map(([href, label]) => (
          <Link key={href} href={href} className="py-1 underline-offset-4 hover:text-clay-deep hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
