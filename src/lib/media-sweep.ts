// "Clean up media": which ImageKit files and media rows can go. Pure, so it can be tested
// and shown as a preview before anything is deleted. A file or row is KEPT when any of these
// holds: an event or member links it; its address is in one of the last 5 releases (so an
// owner can still roll back to them); or it is younger than the grace period (an upload
// made in a form that hasn't been saved yet). Nothing outside the media root folder is
// ever touched (the account also holds ImageKit's own sample files).

export const KEEP_RELEASES = 5;
export const GRACE_HOURS = 24;

export type IkFile = { fileId: string; filePath: string; url: string; createdAt: string };
export type SweepMediaRow = { id: number; provider: string; file_id: string | null; url: string | null; uploaded_at: string | null };

export type SweepPlan = {
  /** media rows to delete (their files are in `files` too) */
  rows: number[];
  /** ImageKit files to delete, with why */
  files: { fileId: string; filePath: string; why: "unused upload" | "orphan file" }[];
  kept: number;
};

const bare = (u: string) => u.split("?")[0].replace(/\/ik-thumbnail\.jpg$/, "").replace(/\/+$/, "");

/** Every media address a release snapshot uses (event media and posters, event and member photos). */
export function releaseUrls(snapshots: unknown[]): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => typeof v === "string" && v.startsWith("https://") && out.add(bare(v));
  for (const s of snapshots) {
    const snap = (s ?? {}) as { events?: unknown[]; members?: unknown[] };
    for (const e of snap.events ?? []) {
      const ev = (e ?? {}) as { photo?: unknown; media?: unknown[] };
      add(ev.photo);
      for (const m of ev.media ?? []) {
        const item = (m ?? {}) as { url?: unknown; poster?: unknown };
        add(item.url);
        add(item.poster);
      }
    }
    for (const m of snap.members ?? []) add(((m ?? {}) as { photo?: unknown }).photo);
  }
  return out;
}

/** Media ids that events and members link to now. */
export function linkedIds(events: { media_ids?: (number | string)[] | null }[], members: { photo_id?: number | string | null }[]): Set<number> {
  const out = new Set<number>();
  for (const e of events) for (const id of e.media_ids ?? []) out.add(Number(id));
  for (const m of members) if (m.photo_id != null) out.add(Number(m.photo_id));
  return out;
}

export function planSweep(input: {
  root: string;
  media: SweepMediaRow[];
  linked: Set<number>;
  inReleases: Set<string>;
  files: IkFile[];
  now: Date;
  graceHours?: number;
}): SweepPlan {
  const root = input.root.replace(/\/+$/, "") + "/";
  const grace = (input.graceHours ?? GRACE_HOURS) * 3600 * 1000;
  const young = (iso: string | null) => !iso || input.now.getTime() - new Date(iso).getTime() < grace;
  const released = (url: string | null) => Boolean(url && input.inReleases.has(bare(url)));
  const inRoot = input.files.filter((f) => f.filePath.startsWith(root));
  const fileById = new Map(inRoot.map((f) => [f.fileId, f]));

  const plan: SweepPlan = { rows: [], files: [], kept: 0 };
  const rowFileIds = new Set<string>();
  for (const m of input.media.filter((r) => r.provider === "imagekit")) {
    if (m.file_id) rowFileIds.add(m.file_id);
    if (input.linked.has(Number(m.id)) || released(m.url) || young(m.uploaded_at)) {
      plan.kept++;
      continue;
    }
    plan.rows.push(Number(m.id));
    const f = m.file_id ? fileById.get(m.file_id) : undefined;
    if (f) plan.files.push({ fileId: f.fileId, filePath: f.filePath, why: "unused upload" });
  }
  for (const f of inRoot) {
    if (rowFileIds.has(f.fileId)) continue;
    if (released(f.url) || young(f.createdAt)) {
      plan.kept++;
      continue;
    }
    plan.files.push({ fileId: f.fileId, filePath: f.filePath, why: "orphan file" });
  }
  return plan;
}
