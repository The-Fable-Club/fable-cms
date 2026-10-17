"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCan } from "@/lib/auth";
import { canSaveEvent } from "@/lib/roles";
import { parseEventForm, parseMemberForm } from "@/lib/forms";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./form-state";

type DbError = { code?: string; message: string } | null;
function friendly(error: NonNullable<DbError>): FormState {
  if (error.code === "23505") return { errors: { slug: "That web address is already used. Pick another." }, message: "Not saved: that web address is already used." };
  if (error.code === "42501") return { errors: {}, message: "You don't have permission to do that." };
  if (error.code === "23514") return { errors: {}, message: `Not saved: a value was rejected by the database (${error.message}).` };
  return { errors: {}, message: `Not saved: ${error.message}` };
}

export async function saveEventAction(id: number | null, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireCan("edit_draft_events");
  const parsed = parseEventForm(form, publicEnv().url);
  if (!parsed.ok) return { errors: parsed.errors, message: "Not saved: please fix the highlighted fields." };

  const supabase = await createClient();
  let existingDraft: boolean | null = null;
  if (id !== null) {
    const { data } = await supabase.from("events").select("draft").eq("id", id).maybeSingle();
    if (!data) return { errors: {}, message: "Not saved: that event no longer exists, or you can't see it." };
    existingDraft = Boolean(data.draft);
  }
  const allowed = canSaveEvent(admin.role, { existingDraft, newDraft: Boolean(parsed.row.draft) });
  if (!allowed.ok) return { errors: {}, message: allowed.message };

  const { error } = id === null ? await supabase.from("events").insert(parsed.row) : await supabase.from("events").update(parsed.row).eq("id", id);
  if (error) return friendly(error);
  revalidatePath("/events");
  revalidatePath("/");
  redirect("/events?saved=1");
}

export async function saveMemberAction(id: number | null, _prev: FormState, form: FormData): Promise<FormState> {
  await requireCan("manage_members");
  const parsed = parseMemberForm(form, publicEnv().url);
  if (!parsed.ok) return { errors: parsed.errors, message: "Not saved: please fix the highlighted fields." };

  const supabase = await createClient();
  const { error } = id === null ? await supabase.from("members").insert(parsed.row) : await supabase.from("members").update(parsed.row).eq("id", id);
  if (error) return friendly(error);
  revalidatePath("/members");
  revalidatePath("/");
  redirect("/members?saved=1");
}
