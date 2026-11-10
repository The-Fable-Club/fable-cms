import { requireCan } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateOdExcelWorkbook } from "@/lib/od-excel-generator";
import { VIT_REG_NO_REGEX } from "@/lib/od-constants";

function formatDateForOd(isoDate?: string | null): string {
  if (!isoDate) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
  }
  try {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return isoDate;
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
      .select("id, reg_no, name, college, od_slots, od_override, od_override_reason")
      .eq("event_id", eventId)
      .order("reg_no", { ascending: true }),
  ]);

  if (eventRes.error || !eventRes.data) {
    return new Response("Event not found", { status: 404 });
  }

  const event = eventRes.data;
  const checkpoints = checkpointsRes.data ?? [];
  const roster = rosterRes.data ?? [];

  // Required checkpoints for OD
  const requiredCheckpointIds = checkpoints.filter((c) => c.needed_for_od).map((c) => c.id);

  // Load marks
  const allCheckpointIds = checkpoints.map((c) => c.id);
  const { data: marksData } = allCheckpointIds.length > 0
    ? await supabase
        .from("attendance_marks")
        .select("roster_id, checkpoint_id")
        .in("checkpoint_id", allCheckpointIds)
    : { data: [] };

  const marks = marksData ?? [];
  const marksByRosterId = new Map<number, Set<number>>();
  marks.forEach((m) => {
    let set = marksByRosterId.get(m.roster_id);
    if (!set) {
      set = new Set<number>();
      marksByRosterId.set(m.roster_id, set);
    }
    set.add(m.checkpoint_id);
  });

  // Filter students who are eligible for the official OD list:
  // 1. Only VIT Chennai students (registration number \d{2}[A-Za-z]{3}\d{4})
  // 2. Either manually overridden, or did not miss any compulsory checkpoint
  //    (students are in the official file by default, removed only if they missed 1 or more compulsory checkpoints)
  const eligibleStudents = roster.filter((student) => {
    const regNo = (student.reg_no || "").trim();
    if (!VIT_REG_NO_REGEX.test(regNo)) {
      return false; // Exclude non-VIT students from official OD list
    }

    const isOverridden = Boolean(student.od_override);
    if (isOverridden) {
      return true;
    }

    const studentMarks = marksByRosterId.get(student.id) ?? new Set<number>();
    const hasMissedCompulsory = requiredCheckpointIds.some((reqId) => !studentMarks.has(reqId));
    return !hasMissedCompulsory;
  });

  const eventSlots = Array.isArray(event.od_slots) ? (event.od_slots as string[]) : [];
  const formattedDate = formatDateForOd(event.start_date);
  const excelBuffer = await generateOdExcelWorkbook(formattedDate, eligibleStudents, eventSlots);

  const daySlug = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(new Uint8Array(excelBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Official-OD-${event.slug}-${daySlug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
