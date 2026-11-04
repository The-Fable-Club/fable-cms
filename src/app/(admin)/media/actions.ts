"use server";

import { redirect } from "next/navigation";
import { requireCan } from "@/lib/auth";
import { deleteFiles } from "@/lib/imagekit-server";
import { loadSweepPlan } from "@/lib/media-sweep-server";
import { createClient } from "@/lib/supabase/server";

/** Delete what the plan says nothing uses. The plan is worked out again here, never taken from the form. */
export async function cleanUpMediaAction() {
  await requireCan("clean_media");
  const { plan, mediaRows } = await loadSweepPlan();
  const deleted = plan.files.length ? await deleteFiles(plan.files.map((f) => f.fileId)) : [];
  const gone = new Set(deleted);
  const listed = new Set(plan.files.map((f) => f.fileId));
  // a row goes once its file is gone, or if ImageKit no longer has the file at all
  const rows = plan.rows.filter((id) => {
    const fileId = mediaRows.find((m) => Number(m.id) === id)?.file_id;
    return !fileId || gone.has(fileId) || !listed.has(fileId);
  });
  if (rows.length) {
    const supabase = await createClient();
    await supabase.from("media").delete().in("id", rows);
  }
  redirect(`/media?deleted=${deleted.length}&rows=${rows.length}&failed=${plan.files.length - deleted.length}`);
}
