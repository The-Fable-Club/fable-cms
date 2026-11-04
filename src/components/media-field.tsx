"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { checkDuration, checkFile, IMAGE_TYPES, roomFor, VIDEO_TYPES, videoPoster, type MediaKind } from "@/lib/media";

/** One uploaded file, as the form shows it. */
type Item = { id: number; kind: MediaKind; url: string };

const MAX_SIDE = 1600;

/** Resize in the browser (longest side 1600px) and save as WebP, so uploads stay small and fast. */
async function toWebp(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob) throw new Error("Could not convert the picture.");
  return { blob, width, height };
}

/** Width, height and length of a clip, read from its metadata without playing it. */
function clipInfo(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const src = URL.createObjectURL(file);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      URL.revokeObjectURL(src);
    };
    v.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("This browser can't read that clip. Try MP4 (H.264)."));
    };
    v.src = src;
  });
}

/**
 * Upload pictures and short loops straight to ImageKit, and keep the chosen ones in a hidden
 * field as media ids ("12,15,16"). Events: 1 video + 2 pictures; members: 1 picture.
 * The slug is read from the form's `slug` field at upload time, for the folder name.
 */
export function MediaField({
  name,
  kind,
  label,
  defaultIds,
  max,
  hint,
}: {
  name: string;
  kind: "events" | "members";
  label: string;
  defaultIds: number[];
  max: { image: number; video: number };
  hint?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // previews for media already linked (keyed on the ids, so re-renders don't refetch)
  const idsKey = defaultIds.join(",");
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",").map(Number) : [];
    if (!ids.length) return;
    let live = true;
    createClient()
      .from("media")
      .select("id, kind, url")
      .in("id", ids)
      .then(({ data }) => {
        if (!live || !data) return;
        const byId = new Map(data.filter((m) => m.url).map((m) => [m.id as number, m as Item]));
        setItems(ids.map((id) => byId.get(id)).filter((m): m is Item => Boolean(m)));
      });
    return () => {
      live = false;
    };
  }, [idsKey]);

  const room = roomFor(items, max);
  const accept = [...(room.image ? IMAGE_TYPES : []), ...(room.video ? VIDEO_TYPES : [])].join(",");

  async function upload(file: File) {
    const check = checkFile(file, room);
    if (!check.ok) return setError(check.message);
    setError(null);
    setBusy(check.kind === "video" ? "Checking the clip…" : "Preparing the picture…");
    try {
      let body: Blob = file;
      let fileName = file.name;
      let size: { width: number; height: number; duration: number | null };
      if (check.kind === "video") {
        const info = await clipInfo(file);
        const tooLong = checkDuration(info.duration);
        if (tooLong) throw new Error(tooLong);
        size = { width: info.width, height: info.height, duration: Math.round(info.duration * 10) / 10 };
      } else {
        const webp = await toWebp(file);
        body = webp.blob;
        fileName = fileName.replace(/\.[^.]+$/, "") + ".webp";
        size = { width: webp.width, height: webp.height, duration: null };
      }

      setBusy("Uploading…");
      const form = root.current?.closest("form");
      const slug = (form?.querySelector<HTMLInputElement>('[name="slug"]')?.value ?? "").trim();
      const auth = await fetch(`/api/imagekit/auth?kind=${kind}&slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const a = (await auth.json().catch(() => ({}))) as { token?: string; expire?: number; signature?: string; publicKey?: string; folder?: string; error?: string };
      if (!auth.ok || !a.signature) throw new Error(a.error ?? "Uploads are not available right now.");

      const up = new FormData();
      up.set("file", body, fileName);
      up.set("fileName", fileName.replace(/[^\w.-]+/g, "-").slice(-80));
      up.set("folder", a.folder!);
      up.set("useUniqueFileName", "true");
      up.set("publicKey", a.publicKey!);
      up.set("token", a.token!);
      up.set("expire", String(a.expire));
      up.set("signature", a.signature);
      const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", { method: "POST", body: up });
      const r = (await res.json().catch(() => ({}))) as { fileId?: string; filePath?: string; url?: string; message?: string };
      if (!res.ok || !r.fileId || !r.url) throw new Error(r.message ? `ImageKit: ${r.message}` : "The upload failed.");

      setBusy("Saving…");
      const { data, error: dbError } = await createClient()
        .from("media")
        .insert({ provider: "imagekit", file_id: r.fileId, path: r.filePath, url: r.url, kind: check.kind, width: size.width, height: size.height, duration: size.duration })
        .select("id, kind, url")
        .single();
      if (dbError || !data) throw new Error(dbError?.message ?? "Could not record the upload.");
      setItems((list) => [...list, data as Item]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  const move = (i: number) => setItems((list) => {
    const next = [...list];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    return next;
  });
  const images = items.filter((m) => m.kind === "image");

  return (
    <div ref={root}>
      <span className="font-mono text-xs uppercase tracking-widest text-ink/60">{label}</span>
      <input type="hidden" name={name} value={items.map((m) => m.id).join(",")} />
      {hint && <p className="mt-1 text-sm text-ink/60">{hint}</p>}
      <ul className="mt-2 flex flex-wrap gap-4" aria-label={`${label}: chosen files`}>
        {items.map((m, i) => (
          <li key={m.id} className="w-40 border-2 border-ink/15 p-1">
            {m.kind === "video" ? (
              <video src={m.url} poster={videoPoster(m.url)} muted loop playsInline className="aspect-video w-full bg-ink/5 object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${m.url}?tr=w-320,f-auto`} alt="" className="aspect-video w-full bg-ink/5 object-cover" />
            )}
            <p className="mt-1 font-mono text-xs text-ink/60">
              {m.kind === "video" ? "Loop video" : max.image > 1 ? `Picture ${images.indexOf(m) + 1}` : "Photo"}
            </p>
            <div className="mt-1 flex gap-3 text-sm">
              {m.kind === "image" && images.indexOf(m) > 0 && (
                <button type="button" className="underline underline-offset-2" onClick={() => move(i)}>
                  Move up
                </button>
              )}
              <button type="button" className="underline underline-offset-2" onClick={() => setItems((list) => list.filter((x) => x.id !== m.id))}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {(room.image || room.video) && (
        <label className="mt-3 inline-flex h-11 cursor-pointer items-center border-2 border-ink px-5 font-medium transition-colors hover:bg-ink hover:text-paper has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">
          {busy ?? (room.video && room.image ? "Add a picture or loop" : room.video ? "Add a loop video" : "Add a picture")}
          <input
            type="file"
            accept={accept}
            disabled={Boolean(busy)}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-clay-deep">
          {error}
        </p>
      )}
    </div>
  );
}
