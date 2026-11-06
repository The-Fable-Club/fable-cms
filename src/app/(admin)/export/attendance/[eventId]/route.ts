import { requireCan } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  await requireCan("read_signups");
  const { eventId: eventIdStr } = await params;
  const eventId = Number(eventIdStr);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return new Response("Invalid event ID", { status: 400 });
  }

  const supabase = await createClient();

  const [eventRes, checkpointsRes, rosterRes] = await Promise.all([
    supabase.from("events").select("id, title, slug").eq("id", eventId).single(),
    supabase.from("attendance_checkpoints").select("id, title, needed_for_od").eq("event_id", eventId).order("opens_at", { ascending: true }),
    supabase.from("attendance_roster").select("*").eq("event_id", eventId).order("reg_no", { ascending: true }),
  ]);

  if (eventRes.error || !eventRes.data) {
    return new Response("Event not found", { status: 404 });
  }

  const event = eventRes.data;
  const checkpoints = checkpointsRes.data ?? [];
  const roster = rosterRes.data ?? [];

  // Load marks
  const checkpointIds = checkpoints.map((c) => c.id);
  const { data: marksData } = checkpointIds.length > 0
    ? await supabase.from("attendance_marks").select("roster_id, checkpoint_id, method, verified_by").in("checkpoint_id", checkpointIds)
    : { data: [] };

  const marks = marksData ?? [];
  const marksMap = new Map<string, { method: string; verified_by: string | null }>();
  marks.forEach((m) => {
    marksMap.set(`${m.roster_id}:${m.checkpoint_id}`, { method: m.method, verified_by: m.verified_by });
  });

  const columns = [
    "Sl. No.",
    "Registration Number",
    "Student Name",
    "Department",
    "Year",
    "College",
    "Source",
    ...checkpoints.map((c) => c.title + (c.needed_for_od ? " (OD)" : "")),
    "Volunteer ID Checked",
    "OD Status",
  ];

  const rows = roster.map((student, idx) => {
    let allRequiredPresent = true;
    let hasVolunteerVerification = false;

    const row: Record<string, unknown> = {
      "Sl. No.": idx + 1,
      "Registration Number": student.reg_no,
      "Student Name": student.name,
      Department: student.department || "",
      Year: student.year || "",
      College: student.college || "VIT-CHENNAI",
      Source: student.source === "onspot" ? "On-Spot" : student.flagged ? "Flagged (Missing)" : "EventHub",
    };

    checkpoints.forEach((c) => {
      const colName = c.title + (c.needed_for_od ? " (OD)" : "");
      const mark = marksMap.get(`${student.id}:${c.id}`);
      if (mark) {
        row[colName] = mark.method === "volunteer_scan" ? "Present (Volunteer)" : "Present";
        if (mark.method === "volunteer_scan" || mark.verified_by) {
          hasVolunteerVerification = true;
        }
      } else {
        row[colName] = "Absent";
        if (c.needed_for_od) {
          allRequiredPresent = false;
        }
      }
    });

    row["Volunteer ID Checked"] = hasVolunteerVerification ? "Yes" : "No";
    row["OD Status"] = allRequiredPresent && hasVolunteerVerification ? "Eligible" : "Ineligible";

    return row;
  });

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="OD-Report-${event.slug}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
