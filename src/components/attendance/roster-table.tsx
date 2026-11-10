"use client";

import { useMemo, useState } from "react";
import { OdOverrideButton } from "./od-override-button";

export type RosterItem = {
  id: number;
  reg_no: string;
  name: string;
  department: string | null;
  year: string | null;
  college: string | null;
  source: string;
  flagged: boolean;
  od_slots: string[] | null;
  od_override: boolean;
  od_override_reason: string | null;
};

export type CheckpointItem = {
  id: number;
  title: string;
  opens_at: string;
  closes_at: string;
  needed_for_od: boolean;
};

type SortCol = "reg_no" | "name" | "college" | "dept_year" | `chk_${number}` | "od_status";

function formatShortTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h12",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function RosterTable({
  roster,
  studentMarksMap,
  checkpoints,
  manage = false,
}: {
  roster: RosterItem[];
  studentMarksMap: Record<number, Record<number, string>>;
  checkpoints: CheckpointItem[];
  manage?: boolean;
}) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  const sortedRoster = useMemo(() => {
    if (!sortCol) return roster;

    return [...roster].sort((a, b) => {
      let cmp = 0;

      if (sortCol === "reg_no") {
        cmp = a.reg_no.localeCompare(b.reg_no, undefined, { sensitivity: "base" });
      } else if (sortCol === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortCol === "college") {
        const colA = a.college || "VIT Chennai";
        const colB = b.college || "VIT Chennai";
        cmp = colA.localeCompare(colB, undefined, { sensitivity: "base" });
      } else if (sortCol === "dept_year") {
        const dyA = [a.department, a.year].filter(Boolean).join(" ");
        const dyB = [b.department, b.year].filter(Boolean).join(" ");
        cmp = dyA.localeCompare(dyB, undefined, { sensitivity: "base" });
      } else if (sortCol.startsWith("chk_")) {
        const chkId = Number(sortCol.slice(4));
        const markA = studentMarksMap[a.id]?.[chkId] || "";
        const markB = studentMarksMap[b.id]?.[chkId] || "";
        cmp = markA.localeCompare(markB);
      } else if (sortCol === "od_status") {
        const marksA = studentMarksMap[a.id] || {};
        const marksB = studentMarksMap[b.id] || {};
        const missedA = checkpoints.filter((c) => c.needed_for_od && !marksA[c.id]).length;
        const missedB = checkpoints.filter((c) => c.needed_for_od && !marksB[c.id]).length;
        const eligA = a.od_override ? 2 : missedA === 0 ? 1 : 0;
        const eligB = b.od_override ? 2 : missedB === 0 ? 1 : 0;
        cmp = eligA - eligB;
      }

      if (cmp === 0) {
        cmp = a.reg_no.localeCompare(b.reg_no, undefined, { sensitivity: "base" });
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [roster, sortCol, sortDir, studentMarksMap, checkpoints]);

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b-2 border-ink font-mono text-xs uppercase tracking-widest text-ink/60">
        <tr>
          <th onClick={() => handleSort("reg_no")} className="py-2.5 cursor-pointer select-none">
            Reg No
          </th>
          <th onClick={() => handleSort("name")} className="cursor-pointer select-none">
            Name
          </th>
          <th onClick={() => handleSort("college")} className="cursor-pointer select-none">
            College
          </th>
          <th onClick={() => handleSort("dept_year")} className="cursor-pointer select-none">
            Dept / Year
          </th>
          {checkpoints.map((c) => (
            <th
              key={c.id}
              onClick={() => handleSort(`chk_${c.id}`)}
              className="text-center whitespace-nowrap px-2 cursor-pointer select-none"
            >
              {c.title}
              {c.needed_for_od && <span className="text-clay-deep ml-1">*</span>}
            </th>
          ))}
          <th onClick={() => handleSort("od_status")} className="text-center cursor-pointer select-none">
            OD Status
          </th>
          <th className="text-right">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink/20">
        {sortedRoster.length === 0 ? (
          <tr>
            <td colSpan={6 + checkpoints.length} className="py-6 text-center text-ink/40">
              No attendees registered yet. Import a spreadsheet or add on-spot above.
            </td>
          </tr>
        ) : (
          sortedRoster.map((r) => {
            const studentMarks = studentMarksMap[r.id] || {};
            const missedRequired = checkpoints.filter((c) => c.needed_for_od && !studentMarks[c.id]);
            const isEligible = Boolean(r.od_override) || missedRequired.length === 0;
            const isOverridden = Boolean(r.od_override);

            return (
              <tr key={r.id} className="hover:bg-paper-raised">
                <td className="py-2.5 font-mono font-medium">{r.reg_no}</td>
                <td>
                  <span className="font-medium">{r.name}</span>
                  {r.flagged && (
                    <span className="ml-1.5 border border-clay-deep bg-clay-deep/10 px-1 py-0.2 font-mono text-[0.65rem] uppercase text-clay-deep">
                      Missing
                    </span>
                  )}
                </td>
                <td className="text-xs">
                  {r.college && r.college.toLowerCase() !== "vit chennai" ? (
                    <span className="font-semibold text-clay-deep">{r.college}</span>
                  ) : (
                    <span className="text-ink/60">{r.college || "VIT Chennai"}</span>
                  )}
                </td>
                <td className="text-xs text-ink/70">
                  {[r.department, r.year].filter(Boolean).join(" · ") || "–"}
                </td>

                {/* Dynamic Checkpoint Attendance Columns */}
                {checkpoints.map((c) => {
                  const markTime = studentMarks[c.id];
                  return (
                    <td key={c.id} className="text-center font-mono text-xs whitespace-nowrap px-2">
                      {markTime ? (
                        <span
                          className="font-semibold text-ink"
                          title={`Marked at ${formatShortTime(markTime)}`}
                        >
                          ✓ {formatShortTime(markTime)}
                        </span>
                      ) : (
                        <span className="text-ink/30">–</span>
                      )}
                    </td>
                  );
                })}

                {/* OD Eligibility Status */}
                <td className="text-center whitespace-nowrap">
                  {isOverridden ? (
                    <span
                      title={r.od_override_reason || "Manually included by staff"}
                      className="border border-clay-deep bg-clay/20 px-2 py-0.5 font-mono text-xs font-semibold uppercase text-clay-deep cursor-help"
                    >
                      Overridden
                    </span>
                  ) : isEligible ? (
                    <span className="border border-ink bg-paper-raised px-2 py-0.5 font-mono text-xs font-semibold uppercase text-ink">
                      Eligible
                    </span>
                  ) : (
                    <span
                      title={
                        missedRequired.length > 0
                          ? `Missed: ${missedRequired.map((c) => c.title).join(", ")}`
                          : "Ineligible"
                      }
                      className="border border-ink/30 bg-paper px-2 py-0.5 font-mono text-xs uppercase text-ink/50 cursor-help"
                    >
                      Ineligible
                    </span>
                  )}
                </td>

                {/* Override Action */}
                <td className="text-right whitespace-nowrap">
                  {manage && (
                    <OdOverrideButton
                      rosterId={r.id}
                      isOverridden={isOverridden}
                      studentName={r.name}
                    />
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
