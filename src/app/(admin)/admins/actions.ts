"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { canChangeRole, canRemove, parseNewAdmin, type AdminRow } from "@/lib/admins";
import { createClient } from "@/lib/supabase/server";

export type AdminsState = { message: string | null; ok: boolean };

async function list() {
  const supabase = await createClient();
  const { data } = await supabase.from("admins").select("github_username, role");
  return { supabase, admins: (data ?? []) as AdminRow[] };
}

export async function addAdminAction(_prev: AdminsState, form: FormData): Promise<AdminsState> {
  const owner = await requireOwner();
  const parsed = parseNewAdmin(String(form.get("username") ?? ""), String(form.get("role") ?? ""));
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const { supabase, admins } = await list();
  if (admins.some((a) => a.github_username === parsed.username)) return { ok: false, message: "They are already in the list." };
  const { error } = await supabase.from("admins").insert({ github_username: parsed.username, role: parsed.role, added_by: owner.username });
  if (error) return { ok: false, message: `Could not add them: ${error.message}` };
  revalidatePath("/admins");
  return { ok: true, message: `@${parsed.username} can now sign in as ${parsed.role}.` };
}

export async function removeAdminAction(form: FormData) {
  const owner = await requireOwner();
  const target = String(form.get("username") ?? "");
  const { supabase, admins } = await list();
  if (!canRemove(admins, owner.username, target).ok) return;
  await supabase.from("admins").delete().eq("github_username", target);
  revalidatePath("/admins");
}

export async function changeRoleAction(form: FormData) {
  await requireOwner();
  const target = String(form.get("username") ?? "");
  const role = String(form.get("role") ?? "");
  if (role !== "owner" && role !== "editor") return;
  const { supabase, admins } = await list();
  if (!canChangeRole(admins, target, role).ok) return;
  await supabase.from("admins").update({ role }).eq("github_username", target);
  revalidatePath("/admins");
}
