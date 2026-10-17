"use client";

import { useState } from "react";

export const inputCls =
  "mt-1 h-11 w-full border-2 border-ink bg-paper px-3 outline-none focus:ring-2 focus:ring-clay aria-[invalid=true]:border-clay-deep";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="font-mono text-xs uppercase tracking-widest text-ink/60">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink/50">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-clay-deep">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * A detail that may not be decided yet: pick a mode, and only that mode's
 * inputs are shown. Hidden inputs stay in the form so switching back does not
 * lose what was typed; the server ignores fields that do not belong to the mode.
 */
export function ModeGroup({
  label,
  name,
  modes,
  initial,
  panels,
  error,
}: {
  label: string;
  name: string;
  modes: { value: string; label: string }[];
  initial: string;
  panels: Record<string, React.ReactNode>;
  error?: string;
}) {
  const [mode, setMode] = useState(initial);
  return (
    <fieldset className="border-2 border-ink p-4">
      <legend className="px-2 font-mono text-xs uppercase tracking-widest text-ink/60">{label}</legend>
      <div role="radiogroup" aria-label={`${label} type`} className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <label
            key={m.value}
            className="cursor-pointer border-2 border-ink px-3 py-1.5 text-sm transition-colors has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-clay"
          >
            <input type="radio" name={name} value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
            {m.label}
          </label>
        ))}
      </div>
      {modes.map((m) => (
        <div key={m.value} hidden={mode !== m.value} className="mt-4 grid gap-4 sm:grid-cols-2">
          {panels[m.value]}
        </div>
      ))}
      {error && (
        <p role="alert" className="mt-3 text-sm text-clay-deep">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export const ART = ["sprouts", "book", "code-window", "cursor", "hands-together", "network", "party", "pointer", "search", "steps", "thinker", "writing"];

export function ArtPicker({ defaultValue }: { defaultValue: string }) {
  const [v, setV] = useState(defaultValue || "sprouts");
  return (
    <fieldset>
      <legend className="font-mono text-xs uppercase tracking-widest text-ink/60">Illustration (used when there is no photo)</legend>
      <input type="hidden" name="art" value={v} />
      <div className="mt-2 flex flex-wrap gap-2">
        {ART.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setV(a)}
            aria-pressed={v === a}
            title={a}
            className={`grid size-16 place-items-center border-2 p-1 ${v === a ? "border-clay-deep bg-clay/20" : "border-ink/30 hover:border-ink"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://thefableclub.com/art/${a}.svg`} alt={a} className="size-full object-contain" />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
