import "server-only";
import type { IkFile } from "@/lib/media-sweep";

// Server-side ImageKit calls for the clean-up (list and delete). The private key never leaves
// the server. Kept to a couple of requests per use: one listing page per 1000 files and one
// batch delete per 100 files.

const API = "https://api.imagekit.io/v1";

function auth(): string | null {
  const key = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  return key ? "Basic " + Buffer.from(key + ":").toString("base64") : null;
}

export const mediaRoot = () => process.env.IMAGEKIT_FOLDER_ROOT?.trim().replace(/\/+$/, "") || "/fable";
export const imagekitConfigured = () => Boolean(auth());

/**
 * Every file under `root` (all subfolders), and ImageKit's clock (its Date header): the grace
 * period is measured on server time, never on the clock of the machine running the CMS.
 */
export async function listFiles(root: string): Promise<{ files: IkFile[]; now: Date }> {
  const a = auth();
  if (!a) throw new Error("ImageKit is not configured.");
  const out: IkFile[] = [];
  let now = new Date();
  for (let skip = 0; skip < 20000; skip += 1000) {
    const q = new URLSearchParams({ type: "file", limit: "1000", skip: String(skip), searchQuery: `path : "${root}/"` });
    const r = await fetch(`${API}/files?${q}`, { headers: { Authorization: a }, cache: "no-store" });
    if (!r.ok) throw new Error(`ImageKit listing failed (${r.status}).`);
    const date = new Date(r.headers.get("date") ?? "");
    if (!Number.isNaN(date.getTime())) now = date;
    const page = (await r.json()) as { fileId: string; filePath: string; url: string; createdAt: string }[];
    out.push(...page.map(({ fileId, filePath, url, createdAt }) => ({ fileId, filePath, url, createdAt })));
    if (page.length < 1000) break;
  }
  return { files: out, now };
}

/** Delete files by id; returns the ids ImageKit confirmed. */
export async function deleteFiles(ids: string[]): Promise<string[]> {
  const a = auth();
  if (!a) throw new Error("ImageKit is not configured.");
  const done: string[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`${API}/files/batch/deleteByFileIds`, {
      method: "POST",
      headers: { Authorization: a, "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds: ids.slice(i, i + 100) }),
    });
    const j = (await r.json().catch(() => ({}))) as { successfullyDeletedFileIds?: string[] };
    done.push(...(j.successfullyDeletedFileIds ?? []));
  }
  return done;
}
