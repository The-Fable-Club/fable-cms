// Media rules shared by the upload field (browser), the sign route and the publish builder.
// Uploads go straight from the browser to ImageKit; these checks run in the browser before
// the upload starts (CMS users are club staff), and the database and the data contract
// check the result again (row constraints, ImageKit host, at most 1 video + 2 pictures).

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
/** Pictures are resized to WebP in the browser, so the original may be a large phone photo. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** Short silent background loops only; full recordings go on YouTube. */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 20;

export type MediaKind = "image" | "video";
const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** Which kind a picked file is, or why it can't be used. Checked before reading the file. */
export function checkFile(file: { type: string; size: number }, allow: { image: boolean; video: boolean }): { ok: true; kind: MediaKind } | { ok: false; message: string } {
  const type = file.type.toLowerCase();
  if ((IMAGE_TYPES as readonly string[]).includes(type)) {
    if (!allow.image) return { ok: false, message: "This slot takes a video, not a picture." };
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: `That picture is too large (${mb(file.size)}). Pick one under ${mb(MAX_IMAGE_BYTES)}.` };
    return { ok: true, kind: "image" };
  }
  if ((VIDEO_TYPES as readonly string[]).includes(type)) {
    if (!allow.video) return { ok: false, message: "Only pictures can go here (JPEG, PNG, WebP or AVIF)." };
    if (file.size > MAX_VIDEO_BYTES) return { ok: false, message: `That clip is too large (${mb(file.size)}). Keep loops under ${mb(MAX_VIDEO_BYTES)}.` };
    return { ok: true, kind: "video" };
  }
  const what = allow.video ? "a picture (JPEG, PNG, WebP, AVIF) or a short MP4/WebM loop" : "a picture (JPEG, PNG, WebP or AVIF)";
  return { ok: false, message: `That file type isn't supported${file.type ? ` (${file.type})` : ""}. Choose ${what}.` };
}

/** A clip's length, read in the browser. */
export function checkDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Could not read the clip's length. Try MP4 (H.264).";
  if (seconds > MAX_VIDEO_SECONDS) return `That clip is ${Math.round(seconds)} s long. Background loops can be at most ${MAX_VIDEO_SECONDS} s; put full recordings on YouTube.`;
  return null;
}

/** May this list take one more of `kind`? Events: 1 video + 2 pictures; members: 1 picture. */
export function roomFor(have: { kind: MediaKind }[], max: { image: number; video: number }) {
  const n = (k: MediaKind) => have.filter((m) => m.kind === k).length;
  return { image: n("image") < max.image, video: n("video") < max.video };
}

// Fixed upload folders: <root>/events/<slug>, <root>/members/<slug>, <root>/about.
export const UPLOAD_KINDS = ["events", "members", "about"] as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function folderFor(kind: string | null, slug: string | null, root = "/fable"): string | null {
  if (!kind || !(UPLOAD_KINDS as readonly string[]).includes(kind)) return null;
  if (kind === "about") return `${root}/about`;
  const s = slug && SLUG.test(slug) && slug.length <= 80 ? slug : "new";
  return `${root}/${kind}/${s}`;
}

/** An ImageKit delivery URL (the only host the site accepts for uploaded media). */
export const isImagekitUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "ik.imagekit.io";
  } catch {
    return false;
  }
};

/** ImageKit makes a still from a video at this address (used as the clip's poster). */
export const videoPoster = (url: string) => `${url.replace(/\/+$/, "")}/ik-thumbnail.jpg`;

/** "1,2,3" from a form -> [1, 2, 3] (positive integers, no duplicates, at most `max`). */
export function parseIds(v: string, max: number): number[] {
  const out: number[] = [];
  for (const part of v.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, max);
}
