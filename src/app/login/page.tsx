import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signInWithGitHub } from "./actions";

const messages: Record<string, string> = {
  forbidden: "That GitHub account isn't on the admin list. Ask an owner to add it.",
  oauth: "Sign-in didn't complete. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Already an admin: nothing to do here.
  if (await getAdmin()) redirect("/");

  // Signed in but not allowed: offer a way out instead of a dead end.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm border-2 border-ink bg-paper p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-ink/60">The Fable Club</p>
        <h1 className="mt-2 text-3xl font-semibold">CMS</h1>
        <p className="mt-3 text-sm text-ink/70">Sign in with the GitHub account that has been added as an admin.</p>

        {error && messages[error] && (
          <p role="alert" className="mt-5 border-l-4 border-clay-deep bg-clay/15 px-3 py-2 text-sm">
            {messages[error]}
          </p>
        )}

        <form action={signInWithGitHub} className="mt-6">
          <button
            type="submit"
            className="h-12 w-full bg-ink px-4 font-medium text-paper transition-colors hover:bg-clay-deep"
          >
            Sign in with GitHub
          </button>
        </form>

        {user && (
          <form action="/auth/signout" method="post" className="mt-3">
            <button type="submit" className="w-full py-2 text-sm underline underline-offset-4 hover:text-clay-deep">
              Sign out of the current session
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
