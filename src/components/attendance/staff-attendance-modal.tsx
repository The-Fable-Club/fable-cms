"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  getEventRosterAction,
  staffRecordAttendanceAction,
  type SearchStudentResult,
} from "@/app/(admin)/attendance/actions";
import { VIT_OD_SLOTS, normalizeSlotId } from "@/lib/od-constants";

type VerifiedEntry = {
  regNo: string;
  name: string;
  department?: string | null;
  college?: string | null;
  checkpointTitle: string;
  odSlotsCount: number;
  time: string;
};

export function StaffAttendanceModal({
  eventId,
  checkpoints,
  eventOdSlots = [],
  onClose,
}: {
  eventId: number;
  checkpoints: { id: number; title: string }[];
  eventOdSlots?: string[];
  onClose: () => void;
}) {
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<number | undefined>(
    checkpoints[0]?.id
  );
  const [roster, setRoster] = useState<SearchStudentResult[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<SearchStudentResult | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentVerified, setRecentVerified] = useState<VerifiedEntry[]>([]);
  const [lastStatus, setLastStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on Esc key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Click outside to dismiss dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load the full event roster once on modal open for instant, offline-resilient searching
  useEffect(() => {
    let active = true;
    getEventRosterAction(eventId)
      .then((data) => {
        if (active) {
          setRoster(data);
          setIsLoadingRoster(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load event roster:", err);
        if (active) setIsLoadingRoster(false);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  // Pure in-memory filtering: instant response at the door with zero network calls per keystroke
  const clean = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!clean || selectedStudent) return [];
    return roster
      .filter(
        (s) =>
          s.reg_no.toLowerCase().includes(clean) ||
          s.name.toLowerCase().includes(clean)
      )
      .slice(0, 15);
  }, [roster, clean, selectedStudent]);

  // Determine which OD slots apply to this event, falling back to all 6 if unconfigured
  const normalizedEventSlots = (eventOdSlots ?? [])
    .map(normalizeSlotId)
    .filter((id): id is string => Boolean(id));

  const availableSlots =
    normalizedEventSlots.length > 0
      ? VIT_OD_SLOTS.filter((s) => normalizedEventSlots.includes(s.id))
      : VIT_OD_SLOTS;

  // When a student is picked from dropdown
  function handleSelectStudent(student: SearchStudentResult) {
    setSelectedStudent(student);
    setQuery(student.reg_no);
    setShowDropdown(false);

    // If student already has recorded OD slots, normalize and use them; otherwise default to all available slots
    const studentSlots = (student.od_slots ?? [])
      .map(normalizeSlotId)
      .filter((id): id is string => Boolean(id));

    if (studentSlots.length > 0) {
      setSelectedSlots(studentSlots);
    } else {
      setSelectedSlots(availableSlots.map((s) => s.id));
    }
  }

  function handleClearSelection() {
    setSelectedStudent(null);
    setQuery("");
    setShowDropdown(false);
    setSelectedSlots([]);
    searchInputRef.current?.focus();
  }

  function handleToggleSlot(slotId: string) {
    setSelectedSlots((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  }

  function handleRecordAttendance(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent) return;
    if (!selectedCheckpointId) {
      setLastStatus({ ok: false, message: "Please select an active checkpoint." });
      return;
    }

    const checkpointObj = checkpoints.find((c) => c.id === selectedCheckpointId);
    const checkpointTitle = checkpointObj ? checkpointObj.title : "Default Checkpoint";

    startTransition(async () => {
      const res = await staffRecordAttendanceAction(
        selectedStudent.id,
        selectedCheckpointId,
        selectedSlots
      );
      setLastStatus({ ok: res.ok, message: res.message });

      if (res.ok) {
        setRecentVerified((prev) => [
          {
            regNo: selectedStudent.reg_no,
            name: selectedStudent.name,
            department: selectedStudent.department,
            college: selectedStudent.college,
            checkpointTitle,
            odSlotsCount: selectedSlots.length,
            time: new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }).format(new Date()),
          },
          ...prev,
        ]);

        // Optimistically update local roster cache with new OD slots
        setRoster((prev) =>
          prev.map((s) =>
            s.id === selectedStudent.id ? { ...s, od_slots: selectedSlots } : s
          )
        );
        // Background refresh to keep in sync with server
        getEventRosterAction(eventId).then(setRoster).catch(() => {});

        // Reset for next entry
        setSelectedStudent(null);
        setQuery("");
        setShowDropdown(false);
        setSelectedSlots([]);
        searchInputRef.current?.focus();
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col border-4 border-ink bg-paper p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-ink pb-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
              Staff Portal
            </span>
            <h2 className="font-display text-2xl font-bold">Record Attendance & Verify OD</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-ink px-3 py-1 font-mono text-xs uppercase hover:bg-clay hover:text-ink"
          >
            Close [Esc]
          </button>
        </div>

        {/* Checkpoint Selector */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-mono uppercase tracking-wider text-ink/70">
            Active Checkpoint:
          </label>
          <select
            value={selectedCheckpointId ?? ""}
            onChange={(e) => setSelectedCheckpointId(Number(e.target.value) || undefined)}
            className="border-2 border-ink bg-paper px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-clay"
          >
            {checkpoints.length === 0 && <option value="">(No checkpoints defined)</option>}
            {checkpoints.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {/* Search and Autocomplete Form */}
        <div className="relative mt-4">
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
              Search Student (Reg No or Name)
            </span>
            <div className="mt-1 flex gap-2">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  if (selectedStudent) {
                    setSelectedStudent(null);
                  }
                  if (val.trim()) {
                    setShowDropdown(true);
                  }
                }}
                onFocus={() => {
                  if (query.trim() && !selectedStudent) {
                    setShowDropdown(true);
                  }
                }}
                onKeyDown={(e) => {
                  // If Enter is pressed and there's exactly 1 matching result in dropdown, auto-select it
                  if (e.key === "Enter" && showDropdown && searchResults.length === 1) {
                    e.preventDefault();
                    handleSelectStudent(searchResults[0]);
                  }
                }}
                placeholder="e.g. 24BCE1078 or Skandan"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={isPending}
                className="h-12 flex-1 border-2 border-ink bg-paper px-3 font-mono text-lg uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-clay"
              />
              {selectedStudent ? (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="border-2 border-ink bg-paper-raised px-4 text-xs font-mono uppercase tracking-wider hover:bg-clay"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </label>

          {/* Typeahead Dropdown */}
          {showDropdown && !selectedStudent && query.trim().length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto border-2 border-ink bg-paper shadow-2xl"
            >
              {isLoadingRoster ? (
                <div className="p-3 text-sm font-mono text-ink/60 flex items-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin border-2 border-ink border-t-transparent" />
                  Loading event roster…
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-sm text-ink/60">
                  <p className="font-semibold text-ink">No student found matching &ldquo;{query}&rdquo;.</p>
                  <p className="mt-1 text-xs">
                    Check the registration number, or add them as a walk-in in the <strong>On-spot Registration</strong> section.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-ink/20">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectStudent(s)}
                      className="w-full p-3 text-left hover:bg-paper-raised flex items-center justify-between transition-colors cursor-pointer group"
                    >
                      <div>
                        <span className="font-mono font-bold text-base group-hover:text-clay-deep">
                          {s.reg_no}
                        </span>
                        <span className="mx-2 text-ink/40">—</span>
                        <span className="font-medium text-sm">{s.name}</span>
                        {s.college && s.college.toLowerCase() !== "vit chennai" && (
                          <span className="ml-2 text-xs font-mono text-clay-deep">({s.college})</span>
                        )}
                      </div>
                      <span className="text-xs text-ink/60 font-mono">
                        {[s.department, s.year].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Student Card & OD Slot Configuration */}
        {selectedStudent && (
          <div className="mt-4 border-2 border-ink bg-paper-raised p-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-ink/60">Selected Attendee</span>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-xl font-bold font-mono">{selectedStudent.reg_no}</h3>
                  <span className="text-lg font-medium">{selectedStudent.name}</span>
                </div>
                <p className="text-xs text-ink/70">
                  {[selectedStudent.college, selectedStudent.department, selectedStudent.year]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </div>
            </div>

            {/* OD Slot Checkboxes */}
            <div className="mt-4 border-t border-ink/20 pt-3">
              <span className="font-mono text-xs uppercase tracking-widest text-ink/70 block">
                Assign On-Duty (OD) Time Slots:
              </span>
              <p className="text-xs text-ink/60 mb-2">
                All event-approved slots are checked by default. Uncheck any slot if the student left early or does not require OD.
              </p>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableSlots.map((slot) => {
                  const checked = selectedSlots.includes(slot.id);
                  return (
                    <label
                      key={slot.id}
                      className={`flex items-center gap-2 border-2 p-2.5 text-xs font-mono cursor-pointer transition-colors ${
                        checked
                          ? "border-ink bg-clay/20 font-semibold text-ink shadow-sm"
                          : "border-ink/30 bg-paper text-ink/40 line-through"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleSlot(slot.id)}
                        className="h-4 w-4 rounded-none accent-ink"
                      />
                      <span>{slot.code}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Confirm Submit */}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleRecordAttendance}
                disabled={isPending}
                className="border-2 border-ink bg-ink px-6 py-2.5 text-sm font-semibold uppercase tracking-wider text-paper hover:bg-clay-deep disabled:opacity-50"
              >
                {isPending ? "Recording…" : "Confirm & Mark Attendance [Enter]"}
              </button>
            </div>
          </div>
        )}

        {/* Status Notification */}
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

        {/* Verified List for current session */}
        <div className="mt-4 flex-1 overflow-y-auto border-2 border-ink/30 p-3">
          <div className="flex items-center justify-between pb-2 font-mono text-xs uppercase tracking-wider text-ink/60">
            <span>Marked Attendees This Session ({recentVerified.length})</span>
          </div>
          {recentVerified.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink/40">
              No attendance recorded in this session yet. Search by Reg No or Name above to mark.
            </p>
          ) : (
            <ul className="divide-y divide-ink/20">
              {recentVerified.map((v, i) => (
                <li key={`${v.regNo}-${i}`} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-mono font-semibold tracking-wide">{v.regNo}</span>
                    <span className="mx-2 text-ink/40">—</span>
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-2 font-mono text-xs text-clay-deep">
                      [{v.checkpointTitle}]
                    </span>
                    {v.odSlotsCount > 0 && (
                      <span className="ml-2 border border-ink/30 px-1 py-0.2 font-mono text-[0.65rem]">
                        {v.odSlotsCount} OD Slot{v.odSlotsCount > 1 ? "s" : ""}
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
