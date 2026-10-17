import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Admin = {
  /** GitHub username, lower case. Same value the database checks. */
  username: string;
  role: "owner" | "editor";
  avatar: string | null;
};

/**
 * The signed-in admin, or null.
 *
 * Authorisation is decided by the database, not by this app: `is_admin()` and
 * `is_owner()` read the GitHub username from `auth.identities` (set by the
 * provider, not editable by the user) and compare it with the `admins` table.
 * The username here is only for display.
 */
export async function getAdmin(): Promise<Admin | null> {
  const supabase = await createClient();
  // getUser() asks the Auth server to validate the session, unlike a cookie read.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const github = user.identities?.find((i) => i.provider === "github");
  const username = (github?.identity_data?.user_name as string | undefined)?.toLowerCase();
  if (!username) return null;

  const [admin, owner] = await Promise.all([supabase.rpc("is_admin"), supabase.rpc("is_owner")]);
  if (admin.data !== true) return null;

  return {
    username,
    role: owner.data === true ? "owner" : "editor",
    avatar: (github?.identity_data?.avatar_url as string | undefined) ?? null,
  };
}

/** Use at the top of every protected page, layout, server action and route handler. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/login?error=forbidden");
  return admin;
}

/** Owner-only areas (managing admins, rollback). */
export async function requireOwner(): Promise<Admin> {
  const admin = await requireAdmin();
  if (admin.role !== "owner") redirect("/?error=owner-only");
  return admin;
}
