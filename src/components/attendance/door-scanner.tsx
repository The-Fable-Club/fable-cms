"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { volunteerVerifyByRegNoAction } from "@/app/(admin)/attendance/actions";

type VerifiedEntry = {
  regNo: string;
  name: string;
  department?: string;
  year?: string;
  time: string;
};

export function DoorScannerModal({
  eventId,
  checkpoints,
  onClose,
}: {
  eventId: number;
  checkpoints: { id: number; title: string }[];
  onClose: () => void;
}) {
  const [regInput, setRegInput] = useState("");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<number | undefined>(
    checkpoints[0]?.id
  );
  const [recentVerified, setRecentVerified] = useState<VerifiedEntry[]>([]);
  const [lastStatus, setLastStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = regInput.trim().toUpperCase();
    if (!clean) return;

    startTransition(async () => {
      const res = await volunteerVerifyByRegNoAction(eventId, clean, selectedCheckpoint);
      setLastStatus({ ok: res.ok, message: res.message });
      if (res.ok && res.student) {
        setRecentVerified((prev) => [
          {
            regNo: res.student!.reg_no,
            name: res.student!.name,
            department: res.student!.department,
            year: res.student!.year,
            time: new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date()),
          },
          ...prev,
        ]);
        setRegInput("");
      }
      inputRef.current?.focus();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col border-4 border-ink bg-paper p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-ink pb-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
              Volunteer Checkpoint
            </span>
            <h2 className="font-display text-2xl font-bold">Door Check & ID Scanner</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-ink px-3 py-1 font-mono text-xs uppercase hover:bg-clay hover:text-ink"
          >
            Close [Esc]
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-mono uppercase tracking-wider text-ink/70">
            Active Checkpoint:
          </label>
          <select
            value={selectedCheckpoint ?? ""}
            onChange={(e) => setSelectedCheckpoint(Number(e.target.value) || undefined)}
            className="border-2 border-ink bg-paper px-2 py-1 text-sm font-medium"
          >
            {checkpoints.length === 0 && <option value="">(Default: First checkpoint)</option>}
            {checkpoints.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {/* Input & Barcode reader form */}
        <form onSubmit={handleScanSubmit} className="mt-4">
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
              Scan Barcode / Enter Reg No
            </span>
            <div className="mt-1 flex gap-2">
              <input
                ref={inputRef}
                value={regInput}
                onChange={(e) => setRegInput(e.target.value)}
                placeholder="24BCE1078"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={isPending}
                className="h-12 flex-1 border-2 border-ink bg-paper px-3 font-mono text-xl uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-clay"
              />
              <button
                type="submit"
                disabled={isPending || !regInput.trim()}
                className="border-2 border-ink bg-ink px-6 text-sm font-semibold text-paper hover:bg-clay-deep disabled:opacity-50"
              >
                {isPending ? "Checking…" : "Verify ID"}
              </button>
            </div>
          </label>
          <p className="mt-1 text-xs text-ink/50">
            Tip: USB/Bluetooth barcode scanners act as a keyboard wedge and auto-press Enter.
          </p>
        </form>

        {/* Status banner */}
        {lastStatus && (
          <div
            role={lastStatus.ok ? "status" : "alert"}
            className={`mt-4 border-2 p-3 text-sm font-medium ${
              lastStatus.ok
                ? "border-ink bg-ink text-paper"
                : "border-clay-deep bg-paper text-clay-deep"
            }`}
          >
            {lastStatus.message}
          </div>
        )}

        {/* Verified list */}
        <div className="mt-6 flex-1 overflow-y-auto border-2 border-ink/30 p-3">
          <div className="flex items-center justify-between pb-2 font-mono text-xs uppercase tracking-wider text-ink/60">
            <span>Verified Students This Session ({recentVerified.length})</span>
          </div>
          {recentVerified.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink/40">
              No students scanned yet. Scan an ID card or enter a registration number above.
            </p>
          ) : (
            <ul className="divide-y divide-ink/20">
              {recentVerified.map((v, i) => (
                <li key={`${v.regNo}-${i}`} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-mono font-semibold tracking-wide">{v.regNo}</span>
                    <span className="mx-2 text-ink/40">—</span>
                    <span className="font-medium">{v.name}</span>
                    {(v.department || v.year) && (
                      <span className="ml-2 text-xs text-ink/60">
                        ({[v.department, v.year].filter(Boolean).join(", ")})
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-ink/50">{v.time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
