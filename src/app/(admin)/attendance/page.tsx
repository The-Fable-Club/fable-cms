import Link from "next/link";
import { requireCan } from "@/lib/auth";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { EventSelector } from "@/components/attendance/event-selector";
import { RosterUploadForm } from "@/components/attendance/roster-upload-form";
import { OnSpotForm } from "@/components/attendance/onspot-form";
import { AttendanceManager, type CheckpointWithMarks } from "@/components/attendance/attendance-manager";
import { RosterTable } from "@/components/attendance/roster-table";

export const metadata = { title: "Attendance & OD Management" };

const label = "font-mono text-xs uppercase tracking-widest text-ink/60";
const card = "border-2 border-ink p-4 bg-paper";

type PageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function AttendancePage({ searchParams }: PageProps) {
  const me = await requireCan("read_signups");
  // members can look; importing, walk-ins, checkpoints, marking and OD need an admin
  const manage = can(me.role, "take_attendance");
  const params = await searchParams;
  const supabase = await createClient();

  // 1. Fetch available events
  const { data: eventsData, error: eventsErr } = await supabase
    .from("events")
    .select("id, title, start_date, od_slots")
    .order("start_date", { ascending: false, nullsFirst: false });

  const events = (eventsData ?? []) as {
    id: number;
    title: string;
    start_date?: string | null;
    od_slots?: string[] | null;
  }[];

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold">Attendance</h1>
        <div className={card}>
          <p className="text-ink/60">No events found in the database.</p>
          <p className="mt-2 text-sm">
            Please create an event first in the{" "}
            <Link href="/events/new" className="underline font-semibold">
              Events section
            </Link>{" "}
            to manage attendance.
          </p>
        </div>
      </div>
    );
  }

  // Determine selected event
  const selectedEventId = params.event ? Number(params.event) : events[0].id;
  const selectedEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const eventOdSlots = Array.isArray(selectedEvent.od_slots) ? selectedEvent.od_slots : [];

  // 2. Fetch roster counts and sample for selected event
  const [
    { count: totalCount },
    { count: eventHubCount },
    { count: onSpotCount },
    { count: flaggedCount },
    { data: checkpointsData },
    { data: rosterSampleData },
  ] = await Promise.all([
    supabase.from("attendance_roster").select("*", { count: "exact", head: true }).eq("event_id", selectedEvent.id),
    supabase.from("attendance_roster").select("*", { count: "exact", head: true }).eq("event_id", selectedEvent.id).eq("source", "eventhub"),
    supabase.from("attendance_roster").select("*", { count: "exact", head: true }).eq("event_id", selectedEvent.id).eq("source", "onspot"),
    supabase.from("attendance_roster").select("*", { count: "exact", head: true }).eq("event_id", selectedEvent.id).eq("flagged", true),
    supabase.from("attendance_checkpoints").select("id, title, opens_at, closes_at, needed_for_od").eq("event_id", selectedEvent.id).order("opens_at", { ascending: true }),
    supabase.from("attendance_roster").select("id, reg_no, name, department, year, college, source, flagged, od_slots, od_override, od_override_reason").eq("event_id", selectedEvent.id).order("id", { ascending: false }).limit(50),
  ]);

  const rawCheckpoints = (checkpointsData ?? []) as {
    id: number;
    title: string;
    opens_at: string;
    closes_at: string;
    needed_for_od: boolean;
  }[];

  const chkIds = rawCheckpoints.map((c) => c.id);

  // 3. Fetch marks counts for checkpoints and per-student marks mapping
  const marksMap: Record<number, number> = {};
  const studentMarksMap: Record<number, Record<number, string>> = {};
  let staffRecordedCount = 0;

  if (chkIds.length > 0) {
    const { data: marks } = await supabase
      .from("attendance_marks")
      .select("roster_id, checkpoint_id, marked_at, verified_by, method")
      .in("checkpoint_id", chkIds);

    const recordedRosterIds = new Set<number>();
    (marks ?? []).forEach((m) => {
      marksMap[m.checkpoint_id] = (marksMap[m.checkpoint_id] || 0) + 1;
      recordedRosterIds.add(m.roster_id);

      if (!studentMarksMap[m.roster_id]) {
        studentMarksMap[m.roster_id] = {};
      }
      studentMarksMap[m.roster_id][m.checkpoint_id] = m.marked_at;
    });
    staffRecordedCount = recordedRosterIds.size;
  }

  const checkpoints: CheckpointWithMarks[] = rawCheckpoints.map((c) => ({
    ...c,
    marks_count: marksMap[c.id] || 0,
  }));

  const rosterSample = rosterSampleData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-semibold">Attendance & OD Management</h1>
        <span className="border-2 border-ink px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider bg-paper-raised">
          Live System
        </span>
      </div>

      {eventsErr && (
        <p role="alert" className="border-2 border-clay-deep p-3 text-sm text-clay-deep">
          Could not load events: {eventsErr.message}
        </p>
      )}

      {/* Event Selection */}
      <section className={card}>
        <EventSelector events={events} selectedId={selectedEvent.id} />
      </section>

      {/* Roster & On-spot Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Section 1: Roster Import */}
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">1. Roster Import</h2>
            <span className="font-mono text-xs text-ink/60">.xlsx / .ods / .csv</span>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Import the EventHub export spreadsheet. You can re-import with newer files at any time; students missing from a newer file are flagged, never deleted.
          </p>

          {manage ? <RosterUploadForm eventId={selectedEvent.id} /> : <p className="mt-3 text-sm text-ink/60">Importing a roster needs an admin.</p>}

          <dl className="mt-4 grid grid-cols-4 gap-px border-2 border-ink/30 bg-ink/30 text-center text-sm">
            <div className="bg-paper p-3">
              <dt className={label}>Total</dt>
              <dd className="mt-1 text-2xl font-semibold">{totalCount ?? 0}</dd>
            </div>
            <div className="bg-paper p-3">
              <dt className={label}>EventHub</dt>
              <dd className="mt-1 text-2xl font-semibold">{eventHubCount ?? 0}</dd>
            </div>
            <div className="bg-paper p-3">
              <dt className={label}>On-spot</dt>
              <dd className="mt-1 text-2xl font-semibold">{onSpotCount ?? 0}</dd>
            </div>
            <div className="bg-paper p-3">
              <dt className={label}>Marked</dt>
              <dd className="mt-1 text-2xl font-semibold text-clay-deep">{staffRecordedCount}</dd>
            </div>
          </dl>
          {(flaggedCount ?? 0) > 0 && (
            <p className="mt-2 text-xs font-mono text-clay-deep">
              Notice: {flaggedCount} student(s) flagged as missing from latest import.
            </p>
          )}
        </section>

        {/* Section 2: On-spot Registration */}
        <section className={card}>
          <h2 className="text-lg font-semibold">2. On-spot Registration</h2>
          <p className="mt-1 text-sm text-ink/60">
            For walk-ins registering directly at the venue entrance. Adds the student directly into the verified event roster.
          </p>

          {manage ? <OnSpotForm eventId={selectedEvent.id} /> : <p className="mt-3 text-sm text-ink/60">Adding walk-ins needs an admin.</p>}
        </section>
      </div>

      {/* Sections 3 & 4: Checkpoints + Staff Attendance + Dual Export */}
      <AttendanceManager
        eventId={selectedEvent.id}
        checkpoints={checkpoints}
        eventOdSlots={eventOdSlots}
        manage={manage}
      />

      {/* Section 5: Roster Preview with Per-Checkpoint Marks & OD Status */}
      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Roster Preview (Recent {rosterSample.length})</h2>
          <span className="font-mono text-xs uppercase text-ink/50">Top entries with checkpoint marks</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <RosterTable
            roster={rosterSample}
            studentMarksMap={studentMarksMap}
            checkpoints={rawCheckpoints}
            manage={manage}
          />
        </div>
      </section>
    </div>
  );
}
