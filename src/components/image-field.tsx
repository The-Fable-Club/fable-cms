"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";

const MAX = 1600;

/** Resize in the browser (longest side 1600px) and save as WebP, so uploads stay small and fast. */
async function toWebp(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob) throw new Error("Could not convert the image.");
  return { blob, width, height };
}

export function ImageField({ name, folder, defaultPath, label }: { name: string; folder: string; defaultPath: string | null; label: string }) {
  const [path, setPath] = useState(defaultPath ?? "");
  const [state, setState] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const { url } = publicEnv();
  const src = path ? `${url}/storage/v1/object/public/media/${path}` : null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    setState("uploading");
    try {
      const { blob, width, height } = await toWebp(file);
      const target = `${folder}/${crypto.randomUUID()}.webp`;
      const supabase = createClient();
      const up = await supabase.storage.from("media").upload(target, blob, { contentType: "image/webp", upsert: false });
      if (up.error) throw new Error(up.error.message);
      await supabase.from("media").insert({ path: target, width, height });
      setPath(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setState("idle");
      input.value = "";
    }
  }

  return (
    <div>
      <span className="font-mono text-xs uppercase tracking-widest text-ink/60">{label}</span>
      <input type="hidden" name={name} value={path} />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-24 border-2 border-ink object-cover" />
        ) : (
          <div className="grid size-24 place-items-center border-2 border-dashed border-ink/40 text-xs text-ink/50">No photo</div>
        )}
        <div className="space-y-2">
          <input type="file" accept="image/*" onChange={onPick} disabled={state === "uploading"} className="block text-sm" />
          {path && (
            <button type="button" onClick={() => setPath("")} className="text-sm underline underline-offset-4 hover:text-clay-deep">
              Remove photo
            </button>
          )}
          {state === "uploading" && <p className="text-sm">Uploading…</p>}
          {error && (
            <p role="alert" className="text-sm text-clay-deep">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
