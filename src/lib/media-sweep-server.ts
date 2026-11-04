import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listFiles, mediaRoot } from "@/lib/imagekit-server";
import { KEEP_RELEASES, linkedIds, planSweep, releaseUrls, type SweepMediaRow } from "@/lib/media-sweep";

/** Read everything the clean-up needs and work out the plan (nothing is deleted here). */
export async function loadSweepPlan() {
  const supabase = await createClient();
  const [media, events, members, releases, listing] = await Promise.all([
    supabase.from("media").select("id, provider, file_id, url, uploaded_at"),
    supabase.from("events").select("media_ids"),
    supabase.from("members").select("photo_id"),
    supabase.from("releases").select("snapshot").order("id", { ascending: false }).limit(KEEP_RELEASES),
    listFiles(mediaRoot()),
  ]);
  for (const [what, r] of [["media", media], ["events", events], ["members", members], ["releases", releases]] as const) {
    if (r.error) throw new Error(`Could not read ${what}: ${r.error.message}`);
  }
  const plan = planSweep({
    root: mediaRoot(),
    media: (media.data ?? []) as SweepMediaRow[],
    linked: linkedIds(events.data ?? [], members.data ?? []),
    inReleases: releaseUrls((releases.data ?? []).map((r) => r.snapshot)),
    files: listing.files,
    now: listing.now,
  });
  return { plan, root: mediaRoot(), total: listing.files.length, mediaRows: (media.data ?? []) as SweepMediaRow[] };
}
