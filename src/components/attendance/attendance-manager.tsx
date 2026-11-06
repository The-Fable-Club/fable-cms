"use client";

import { useState } from "react";
import Link from "next/link";
import { PresenterModal } from "./presenter-modal";
import { CheckpointDialog, type CheckpointItem } from "./checkpoint-dialog";
import { DoorScannerModal } from "./door-scanner";

export type CheckpointWithMarks = CheckpointItem & {
  marks_count: number;
};

function formatIstTime(iso: string) {
  if (!iso) return "–";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getCheckpointStatus(opensAt: string, closesAt: string) {
  const now = new Date();
  const open = new Date(opensAt);
  const close = new Date(closesAt);
  if (now < open) return { label: "Upcoming", badge: "border-ink/40 text-ink/60" };
  if (now > close) return { label: "Closed", badge: "border-ink/20 text-ink/40" };
  return { label: "Active Now", badge: "bg-clay/30 border-clay-deep text-clay-deep font-semibold" };
}

export function AttendanceManager({
  eventId,
  checkpoints,
}: {
  eventId: number;
  checkpoints: CheckpointWithMarks[];
}) {
  const [presenterId, setPresenterId] = useState<number | null>(null);
  const [editingCheckpoint, setEditingCheckpoint] = useState<CheckpointItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [showDoorScanner, setShowDoorScanner] = useState(false);

  return (
    <>
      {/* 3. Checkpoints Management */}
      <section className="border-2 border-ink p-4 bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">3. Checkpoints & Rolling Presenter Codes</h2>
            <p className="mt-1 text-sm text-ink/60">
              Checkpoints open for specific time windows. Organizers project the live 20s rolling code on the room screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="border-2 border-ink bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-clay-deep"
          >
            + Add Checkpoint
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-ink font-mono text-xs uppercase tracking-widest text-ink/60">
              <tr>
                <th className="py-2.5">Checkpoint</th>
                <th>Opens (IST)</th>
                <th>Closes (IST)</th>
                <th>OD Required</th>
                <th>Status</th>
                <th>Marked</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/20">
              {checkpoints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink/50">
                    No checkpoints defined yet for this event. Click &ldquo;+ Add Checkpoint&rdquo; to create one.
                  </td>
                </tr>
              ) : (
                checkpoints.map((c) => {
                  const status = getCheckpointStatus(c.opens_at, c.closes_at);
                  return (
                    <tr key={c.id} className="hover:bg-paper-raised">
                      <td className="py-3 font-medium">{c.title}</td>
                      <td className="tabular-nums text-xs text-ink/70">{formatIstTime(c.opens_at)}</td>
                      <td className="tabular-nums text-xs text-ink/70">{formatIstTime(c.closes_at)}</td>
                      <td>
                        {c.needed_for_od ? (
                          <span className="border border-ink/40 bg-paper-raised px-1.5 py-0.5 font-mono text-[0.65rem] uppercase">
                            Yes
                          </span>
                        ) : (
                          <span className="font-mono text-[0.65rem] uppercase text-ink/40">Optional</span>
                        )}
                      </td>
                      <td>
                        <span className={`border px-2 py-0.5 font-mono text-xs uppercase tracking-wider ${status.badge}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="font-mono font-semibold">{c.marks_count}</td>
                      <td className="space-x-2 text-right">
                        <button
                          type="button"
                          onClick={() => setPresenterId(c.id)}
                          className="border-2 border-ink bg-paper px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider hover:bg-clay"
                        >
                          Show Code
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCheckpoint(c)}
                          className="border border-ink/40 px-2.5 py-1 font-mono text-xs uppercase hover:border-ink hover:bg-paper-raised"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Door Check and OD List */}
      <section className="border-2 border-ink p-4 bg-paper">
        <h2 className="text-lg font-semibold">4. Door Check and OD Verification</h2>
        <p className="mt-1 text-sm text-ink/60">
          Volunteers scan student ID cards at the door. When the event concludes, download the official university On-Duty CSV report containing students who satisfied every required checkpoint.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowDoorScanner(true)}
            className="border-2 border-ink bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-clay-deep"
          >
            Open Door Scanner
          </button>

          <a
            href={`/export/attendance/${eventId}`}
            download
            className="inline-flex items-center border-2 border-ink bg-paper px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-raised"
          >
            Download OD List (CSV)
          </a>
        </div>
      </section>

      {/* Modals */}
      {presenterId !== null && (
        <PresenterModal checkpointId={presenterId} onClose={() => setPresenterId(null)} />
      )}

      {(isAdding || editingCheckpoint !== null) && (
        <CheckpointDialog
          eventId={eventId}
          checkpoint={editingCheckpoint}
          onClose={() => {
            setIsAdding(false);
            setEditingCheckpoint(null);
          }}
        />
      )}

      {showDoorScanner && (
        <DoorScannerModal
          eventId={eventId}
          checkpoints={checkpoints}
          onClose={() => setShowDoorScanner(false)}
        />
      )}
    </>
  );
}
