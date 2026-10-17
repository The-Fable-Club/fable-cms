"use client";

import { useState } from "react";
import { inputCls } from "@/components/form-bits";

type Item = { kind: string; title: string; body?: string | null; href?: string | null; posted_at: string; posted_by: string };
const KINDS = [
  { v: "announcement", l: "Announcement" },
  { v: "link", l: "Link" },
  { v: "file", l: "File link" },
  { v: "schedule", l: "Schedule" },
];

/** Posts shown to participants on the event's hub page. Stored on the event; they go live when you publish. */
export function HubEditor({ initial, author, error }: { initial: Item[]; author: string; error?: string }) {
  const [items, setItems] = useState<Item[]>(initial);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const set = (i: number, patch: Partial<Item>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <fieldset className="border-2 border-ink p-4">
      <legend className="px-2 font-mono text-xs uppercase tracking-widest text-ink/60">Participant hub posts</legend>
      <input type="hidden" name="hub" value={JSON.stringify(items)} />
      {items.length === 0 && <p className="text-sm text-ink/60">No posts yet.</p>}
      <ul className="space-y-4">
        {items.map((it, i) => (
          <li key={i} className="grid gap-3 border-2 border-ink/30 p-3 sm:grid-cols-2">
            <select aria-label="Type" value={it.kind} onChange={(e) => set(i, { kind: e.target.value })} className={inputCls}>
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
            <input aria-label="Title" placeholder="Title" value={it.title} onChange={(e) => set(i, { title: e.target.value })} className={inputCls} />
            <textarea
              aria-label="Text"
              placeholder="Text (optional)"
              value={it.body ?? ""}
              onChange={(e) => set(i, { body: e.target.value })}
              rows={2}
              className={`${inputCls} h-auto py-2 sm:col-span-2`}
            />
            <input
              aria-label="Link"
              placeholder="https:// link (optional)"
              value={it.href ?? ""}
              onChange={(e) => set(i, { href: e.target.value })}
              className={`${inputCls} sm:col-span-2`}
            />
            <div className="flex items-center justify-between text-xs text-ink/60 sm:col-span-2">
              <span>
                Posted {it.posted_at} by @{it.posted_by}
              </span>
              <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="underline underline-offset-4 hover:text-clay-deep">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setItems((l) => [...l, { kind: "announcement", title: "", body: "", href: "", posted_at: today, posted_by: author }])}
        className="mt-4 h-10 border-2 border-ink px-4 text-sm font-medium hover:bg-ink hover:text-paper"
      >
        Add a post
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-clay-deep">
          {error}
        </p>
      )}
    </fieldset>
  );
}
