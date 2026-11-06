"use client";

import { useEffect, useState } from "react";

type CodeData = {
  ok: boolean;
  code?: string;
  seconds_remaining?: number;
  title?: string;
  is_open?: boolean;
  message?: string;
};

export function PresenterModal({
  checkpointId,
  onClose,
}: {
  checkpointId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<CodeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchCode() {
      try {
        const res = await fetch(`/api/attendance/code?checkpointId=${checkpointId}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: CodeData = await res.json();
        if (active) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setData({ ok: false, message: "Could not fetch code." });
          setLoading(false);
        }
      }
    }

    fetchCode();
    // Poll every 3 seconds to keep seconds remaining and rolling code fresh
    const interval = setInterval(fetchCode, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [checkpointId]);

  const sec = data?.seconds_remaining ?? 20;
  const progress = (sec / 20) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg border-4 border-ink bg-paper p-8 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 border-2 border-ink px-3 py-1 font-mono text-sm uppercase hover:bg-clay hover:text-ink"
        >
          Close [Esc]
        </button>

        <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
          Organizer Presenter Screen
        </span>
        <h2 className="mt-1 font-display text-3xl">{data?.title || "Live Attendance Code"}</h2>

        {loading ? (
          <div className="py-16 text-lg text-ink/60">Loading rolling code…</div>
        ) : !data?.ok ? (
          <div className="my-8 border-2 border-clay-deep p-4 text-clay-deep">
            {data?.message || "Failed to generate code."}
          </div>
        ) : !data.is_open ? (
          <div className="my-8 border-2 border-dashed border-ink/40 p-6 text-ink/60">
            <p className="font-semibold text-ink">Checkpoint Window Closed</p>
            <p className="mt-1 text-sm">This checkpoint is outside its scheduled time window.</p>
          </div>
        ) : (
          <div className="my-8 flex flex-col items-center">
            {/* Countdown circular indicator */}
            <div className="relative flex size-52 items-center justify-center">
              <svg className="size-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="stroke-ink/15 fill-none"
                  strokeWidth="6"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  className="stroke-clay-deep fill-none transition-all duration-1000 ease-linear"
                  strokeWidth="6"
                  strokeDasharray="282.7"
                  strokeDashoffset={282.7 - (282.7 * progress) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="font-mono text-5xl font-bold tracking-widest text-ink">
                  {data.code?.slice(0, 3)} {data.code?.slice(3)}
                </span>
                <span className="mt-2 font-mono text-xs text-ink/50 tabular-nums">
                  refreshes in {sec}s
                </span>
              </div>
            </div>
            <p className="mt-4 max-w-xs font-serif text-sm text-ink/70">
              Project this screen in the room. Students enter their registration number and this code on the website.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
