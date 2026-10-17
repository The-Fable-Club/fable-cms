"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/auth";
import { isInbox, isStatus } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";

/** Change the status and notes of one sign-up. */
export async function setStatusAction(form: FormData) {
  await requireCan("triage_signups");
  const table = String(form.get("table") ?? "");
  const id = Number(form.get("id"));
  const status = String(form.get("status") ?? "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 500);
  if (!isInbox(table) || !Number.isInteger(id) || !isStatus(table, status)) return;
  const supabase = await createClient();
  await supabase.from(table).update({ status, notes: notes || null }).eq("id", id);
  revalidatePath(`/${table}`);
  revalidatePath("/");
}
