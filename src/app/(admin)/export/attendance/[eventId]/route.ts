import { requireCan } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { VIT_OD_SLOTS } from "@/lib/od-constants";

function formatIstTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  await requireCan("read_signups");
  const { eventId: eventIdStr } = await params;
  const eventId = Number(eventIdStr);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return new Response("Invalid event ID", { status: 400 });
  }

  const supabase = await createClient();

  const [eventRes, checkpointsRes, rosterRes] = await Promise.all([
    supabase.from("events").select("id, title, slug, start_date, od_slots").eq("id", eventId).single(),
    supabase
      .from("attendance_checkpoints")
      .select("id, title, needed_for_od")
      .eq("event_id", eventId)
      .order("opens_at", { ascending: true }),
    supabase
      .from("attendance_roster")
      .select("*")
      .eq("event_id", eventId)
      .order("reg_no", { ascending: true }),
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
    ? await supabase
        .from("attendance_marks")
        .select("roster_id, checkpoint_id, marked_at, verified_by, method")
        .in("checkpoint_id", checkpointIds)
    : { data: [] };

  const marks = marksData ?? [];
  const marksMap = new Map<string, { marked_at: string; verified_by: string | null }>();
  marks.forEach((m) => {
    marksMap.set(`${m.roster_id}:${m.checkpoint_id}`, {
      marked_at: m.marked_at,
      verified_by: m.verified_by,
    });
  });

  const slotMap = new Map(VIT_OD_SLOTS.map((s) => [s.id, s.code]));

  const checkpointCols = checkpoints.map(
    (c) => `${c.title}${c.needed_for_od ? " [OD Required]" : " [Optional]"}`
  );

  const columns = [
    "Sl. No.",
    "Registration Number",
    "Student Name",
    "College",
    "Department",
    "Year",
    "Source",
    ...checkpointCols,
    "OD Slots Assigned",
    "OD Eligible",
    "OD Ineligibility / Override Reason",
    "Override Active",
  ];

  const rows = roster.map((student, idx) => {
    const missedCheckpoints: string[] = [];
    const row: Record<string, unknown> = {
      "Sl. No.": idx + 1,
      "Registration Number": student.reg_no,
      "Student Name": student.name,
      College: student.college || "VIT Chennai",
      Department: student.department || "",
      Year: student.year || "",
      Source: student.source === "onspot" ? "On-Spot" : student.flagged ? "Flagged (Missing)" : "EventHub",
    };

    checkpoints.forEach((c) => {
      const colName = `${c.title}${c.needed_for_od ? " [OD Required]" : " [Optional]"}`;
      const mark = marksMap.get(`${student.id}:${c.id}`);
      if (mark) {
        row[colName] = `Present (${formatIstTime(mark.marked_at)})`;
      } else {
        row[colName] = "Absent";
        if (c.needed_for_od) {
          missedCheckpoints.push(c.title);
        }
      }
    });

    const eventSlots = Array.isArray(event.od_slots) ? (event.od_slots as string[]) : [];
    const studentSlots = Array.isArray(student.od_slots) && student.od_slots.length > 0
      ? (student.od_slots as string[])
      : (eventSlots.length > 0 ? eventSlots : ["slot_1", "slot_2", "slot_3", "slot_4", "slot_5", "slot_6"]);

    const slotLabels = studentSlots
      .map((sid) => {
        const norm = (sid.startsWith("slot_") ? sid : slotMap.get(sid)) || sid;
        const v = VIT_OD_SLOTS.find((s) => s.id === norm || s.code === sid);
        return v ? v.code : sid;
      })
      .join(", ");

    row["OD Slots Assigned"] = slotLabels || "None";

    const hasAllRequired = missedCheckpoints.length === 0;
    const isOverridden = Boolean(student.od_override);
    const isEligible = isOverridden || hasAllRequired;

    row["OD Eligible"] = isEligible ? "YES" : "NO";
    row["Override Active"] = isOverridden ? "YES" : "NO";

    if (isOverridden) {
      row["OD Ineligibility / Override Reason"] = `Included via Staff Override (${
        student.od_override_reason || "Manual override"
      })`;
    } else if (isEligible) {
      row["OD Ineligibility / Override Reason"] = "Satisfied all required checkpoints";
    } else if (missedCheckpoints.length > 0) {
      row["OD Ineligibility / Override Reason"] = `Missed: ${missedCheckpoints.join(", ")}`;
    } else {
      row["OD Ineligibility / Override Reason"] = "Ineligible";
    }

    return row;
  });

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Internal-OD-Audit-${event.slug}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
