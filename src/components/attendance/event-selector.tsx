"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function EventSelector({
  events,
  selectedId,
}: {
  events: { id: number; title: string; start_date?: string | null }[];
  selectedId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("event", val);
    router.push(`/attendance?${params.toString()}`);
  }

  return (
    <label className="block max-w-md">
      <span className="font-mono text-xs uppercase tracking-widest text-ink/60">Selected Event</span>
      <select
        value={selectedId}
        onChange={handleChange}
        className="mt-1 block h-11 w-full border-2 border-ink bg-paper px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-clay"
      >
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {ev.title} {ev.start_date ? `(${ev.start_date.slice(0, 10)})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
