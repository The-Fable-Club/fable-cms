import "server-only";
import { redirect } from "next/navigation";
import { can, roleFromRank, type Action, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export type Admin = {
  /** GitHub username, lower case. Same value the database checks. */
  username: string;
  role: Role;
  avatar: string | null;
};

/**
 * The signed-in person with a CMS role, or null.
 *
 * Authorisation is decided by the database, not by this app: `role_rank()` reads the GitHub
 * username from `auth.identities` (set by the provider, not editable by the user) and looks it
 * up in the `admins` table. The row level security policies use the same function, so even a
 * request that skips this app gets the same answer. The username here is only for display.
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

  let role: Role | null = null;
  const ranked = await supabase.rpc("role_rank");
  if (!ranked.error) {
    role = roleFromRank(ranked.data as number);
  } else {
    // Before migration 0006 only is_admin()/is_owner() exist: owners stay owners, other admins act as admins.
    const [admin, owner] = await Promise.all([supabase.rpc("is_admin"), supabase.rpc("is_owner")]);
    role = owner.data === true ? "owner" : admin.data === true ? "admin" : null;
  }
  if (!role) return null;

  return { username, role, avatar: (github?.identity_data?.avatar_url as string | undefined) ?? null };
}

/** Use at the top of every protected page, layout, server action and route handler. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/login?error=forbidden");
  return admin;
}

/** Require a person who may do `action` (see lib/roles.ts). Others are sent to the dashboard with a notice. */
export async function requireCan(action: Action): Promise<Admin> {
  const admin = await requireAdmin();
  if (!can(admin.role, action)) redirect(`/?error=not-allowed`);
  return admin;
}

/** Owner-only areas (managing people, rollback). */
export const requireOwner = () => requireCan("manage_people");
