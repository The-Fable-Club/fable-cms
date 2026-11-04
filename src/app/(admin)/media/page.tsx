import { requireCan } from "@/lib/auth";
import { imagekitConfigured } from "@/lib/imagekit-server";
import { GRACE_HOURS, KEEP_RELEASES } from "@/lib/media-sweep";
import { loadSweepPlan } from "@/lib/media-sweep-server";
import { cleanUpMediaAction } from "./actions";

export const metadata = { title: "Media" };

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireCan("clean_media");
  const q = await searchParams;
  const done = q.deleted !== undefined;

  if (!imagekitConfigured()) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">Media</h1>
        <p>ImageKit is not set up here (no private key), so there is nothing to clean up.</p>
      </div>
    );
  }

  let result: Awaited<ReturnType<typeof loadSweepPlan>> | null = null;
  let error: string | null = null;
  try {
    result = await loadSweepPlan();
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not read the media.";
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">Media</h1>
      <p className="text-ink/70">
        Uploaded pictures and loops live on ImageKit. <strong>Clean up</strong> deletes only files that no event or member uses, that
        aren&apos;t in the last {KEEP_RELEASES} releases (so rolling back stays safe), and that are older than {GRACE_HOURS} hours (so an
        upload in a form that hasn&apos;t been saved yet is left alone). Removing a picture from an event doesn&apos;t delete it; this does.
      </p>
      {done && (
        <p role="status" className="border-2 border-ink/15 p-3">
          Deleted {q.deleted} file(s) and {q.rows} record(s).{Number(q.failed) > 0 && ` ${q.failed} file(s) could not be deleted; try again later.`} ImageKit&apos;s file list can take a minute or two to catch up, so deleted files may still be counted below until then.
        </p>
      )}
      {error && (
        <p role="alert" className="text-clay-deep">
          {error}
        </p>
      )}
      {result && (
        <>
          <p>
            {result.total} file(s) in <code className="font-mono text-sm">{result.root}</code>: {result.plan.files.length} can go,{" "}
            {result.plan.kept} in use or recent.
          </p>
          {result.plan.files.length > 0 && (
            <>
              <ul className="max-h-80 overflow-auto border-2 border-ink/15 p-3 font-mono text-xs">
                {result.plan.files.slice(0, 200).map((f) => (
                  <li key={f.fileId}>
                    {f.filePath} <span className="text-ink/50">({f.why})</span>
                  </li>
                ))}
              </ul>
              <form action={cleanUpMediaAction}>
                <button type="submit" className="inline-flex h-11 items-center border-2 border-ink bg-ink px-6 font-medium text-paper transition-colors hover:bg-transparent hover:text-ink">
                  Delete {result.plan.files.length} unused file(s)
                </button>
              </form>
            </>
          )}
        </>
      )}
    </div>
  );
}
