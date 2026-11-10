"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/auth";
import { parseRosterFile } from "@/lib/roster-parser";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: boolean; message: string };

export type SearchStudentResult = {
  id: number;
  reg_no: string;
  name: string;
  department: string | null;
  year: string | null;
  college: string | null;
  od_slots: string[];
};

import { VIT_REG_NO_REGEX } from "@/lib/od-constants";


function toIstIso(dt: string): string {
  if (!dt) return "";
  if (dt.includes("+") || dt.endsWith("Z")) return dt;
  const full = dt.length === 16 ? `${dt}:00` : dt;
  return `${full}+05:30`;
}

/** Upload and process EventHub spreadsheet (.xlsx, .csv, .ods). */
export async function uploadRosterAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireCan("take_attendance");
  const eventId = Number(form.get("event_id"));
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, message: "Please select an event." };
  }

  const file = form.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Please choose an Excel or CSV file to upload." };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return { ok: false, message: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const parsed = parseRosterFile(buffer);
  if (!parsed.ok) {
    return { ok: false, message: parsed.error };
  }

  if (parsed.attendees.length === 0) {
    return { ok: false, message: "No valid student registration numbers found in this spreadsheet." };
  }

  const supabase = await createClient();

  // Find existing EventHub registrants for this event to detect dropped/missing attendees
  const { data: existingRows, error: fetchErr } = await supabase
    .from("attendance_roster")
    .select("id, reg_no, flagged")
    .eq("event_id", eventId)
    .eq("source", "eventhub");

  if (fetchErr) {
    return { ok: false, message: `Database error: ${fetchErr.message}` };
  }

  const rows = parsed.attendees.map((a) => ({
    event_id: eventId,
    reg_no: a.reg_no,
    name: a.name,
    email: a.email,
    phone: a.phone,
    department: a.department,
    year: a.year,
    college: a.college || "VIT Chennai",
    college_type: a.college_type,
    payment_status: a.payment_status,
    team_id: a.team_id,
    source: "eventhub" as const,
    flagged: false,
    imported_by: admin.username,
  }));

  const { error: upsertErr } = await supabase
    .from("attendance_roster")
    .upsert(rows, { onConflict: "event_id,reg_no" });

  if (upsertErr) {
    return { ok: false, message: `Could not save roster: ${upsertErr.message}` };
  }

  // Detect and flag any students previously in EventHub who are missing from this new file
  const newRegSet = new Set(parsed.attendees.map((a) => a.reg_no));
  const missingIds = (existingRows ?? [])
    .filter((e) => !newRegSet.has(e.reg_no) && !e.flagged)
    .map((e) => e.id);

  if (missingIds.length > 0) {
    await supabase.from("attendance_roster").update({ flagged: true }).in("id", missingIds);
  }

  await supabase.from("audit_log").insert({
    actor: admin.username,
    entity: "attendance_roster",
    entity_id: String(eventId),
    action: "import_eventhub_roster",
    detail: {
      filename: file.name,
      imported: parsed.attendees.length,
      flagged_missing: missingIds.length,
      skipped_rows: parsed.skippedRows,
    },
  });

  revalidatePath("/attendance");
  return {
    ok: true,
    message: `Imported ${parsed.attendees.length} attendees (${missingIds.length > 0 ? `${missingIds.length} flagged missing` : "no dropouts"}).`,
  };
}

/** Add a single on-spot registrant at the venue. */
export async function addOnSpotAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireCan("take_attendance");
  const eventId = Number(form.get("event_id"));
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, message: "Please select an event." };
  }

  const regNo = String(form.get("reg_no") || "").trim().toUpperCase();
  const name = String(form.get("name") || "").trim();
  const department = String(form.get("department") || "").trim() || null;
  const year = String(form.get("year") || "").trim() || null;
  const collegeInput = String(form.get("college") || "").trim();
  const college = collegeInput || "VIT Chennai";

  if (!name) {
    return { ok: false, message: "Student full name is required." };
  }
  if (!regNo) {
    return { ok: false, message: "Registration number is required." };
  }

  // If college is VIT Chennai or blank, enforce 2 digits, 3 letters, 4 digits
  const isVitChennai = college.toLowerCase() === "vit chennai";
  if (isVitChennai) {
    if (!VIT_REG_NO_REGEX.test(regNo)) {
      return {
        ok: false,
        message: "VIT Chennai registration numbers must be 2 digits, 3 letters, 4 digits (e.g. 24BCE1078).",
      };
    }
  } else {
    // Other colleges: accept any non-empty registration number up to 50 characters
    if (regNo.length < 2 || regNo.length > 50) {
      return { ok: false, message: "Enter a valid registration number (2 to 50 characters)." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("attendance_roster").insert({
    event_id: eventId,
    reg_no: regNo,
    name,
    department,
    year,
    college,
    source: "onspot",
    flagged: false,
    imported_by: admin.username,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `${regNo} is already in the roster for this event.` };
    }
    return { ok: false, message: `Could not add student: ${error.message}` };
  }

  await supabase.from("audit_log").insert({
    actor: admin.username,
    entity: "attendance_roster",
    entity_id: String(eventId),
    action: "add_onspot_registration",
    detail: { reg_no: regNo, name, department, year, college },
  });

  revalidatePath("/attendance");
  return { ok: true, message: `Added ${name} (${regNo}) on-spot.` };
}

/** Create or update a checkpoint with IST time parsing. */
export async function saveCheckpointAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireCan("take_attendance");
  const eventId = Number(form.get("event_id"));
  const checkpointId = form.get("checkpoint_id") ? Number(form.get("checkpoint_id")) : null;
  const title = String(form.get("title") || "").trim();
  const opensAtRaw = String(form.get("opens_at") || "").trim();
  const closesAtRaw = String(form.get("closes_at") || "").trim();
  const neededForOd = form.get("needed_for_od") === "on" || form.get("needed_for_od") === "true";

  if (!Number.isInteger(eventId) || eventId <= 0) return { ok: false, message: "Select an event." };
  if (!title) return { ok: false, message: "Checkpoint title is required (e.g. Arrival Check)." };
  if (!opensAtRaw || !closesAtRaw) return { ok: false, message: "Opening and closing times are required." };

  const opensAt = toIstIso(opensAtRaw);
  const closesAt = toIstIso(closesAtRaw);

  if (new Date(closesAt) <= new Date(opensAt)) {
    return { ok: false, message: "Closing time must be after opening time." };
  }

  const supabase = await createClient();
  if (checkpointId) {
    const { error } = await supabase
      .from("attendance_checkpoints")
      .update({ title, opens_at: opensAt, closes_at: closesAt, needed_for_od: neededForOd })
      .eq("id", checkpointId)
      .eq("event_id", eventId);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase.from("attendance_checkpoints").insert({
      event_id: eventId,
      title,
      opens_at: opensAt,
      closes_at: closesAt,
      needed_for_od: neededForOd,
    });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/attendance");
  return { ok: true, message: `Saved checkpoint "${title}".` };
}

/** Delete a checkpoint. */
export async function deleteCheckpointAction(checkpointId: number): Promise<ActionState> {
  await requireCan("take_attendance");
  const supabase = await createClient();
  const { error } = await supabase.from("attendance_checkpoints").delete().eq("id", checkpointId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/attendance");
  return { ok: true, message: "Checkpoint removed." };
}

/** Fetch full event roster once for fast, offline-tolerant browser search. */
export async function getEventRosterAction(eventId: number): Promise<SearchStudentResult[]> {
  await requireCan("read_signups");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_roster")
    .select("id, reg_no, name, department, year, college, od_slots")
    .eq("event_id", eventId)
    .order("reg_no", { ascending: true });

  if (error) {
    console.error("getEventRosterAction error:", error.message);
    const fallback = await supabase
      .from("attendance_roster")
      .select("id, reg_no, name, department, year, college")
      .eq("event_id", eventId)
      .order("reg_no", { ascending: true });

    if (fallback.data) {
      return fallback.data.map((d) => ({
        id: d.id,
        reg_no: d.reg_no,
        name: d.name,
        department: d.department,
        year: d.year,
        college: d.college,
        od_slots: [],
      }));
    }
    return [];
  }

  return (data ?? []).map((d) => ({
    id: d.id,
    reg_no: d.reg_no,
    name: d.name,
    department: d.department,
    year: d.year,
    college: d.college,
    od_slots: Array.isArray(d.od_slots) ? (d.od_slots as string[]) : [],
  }));
}

/** Search roster for typeahead autocomplete matching reg_no or name. */
export async function searchRosterAction(eventId: number, query: string): Promise<SearchStudentResult[]> {
  await requireCan("read_signups");
  const clean = query.trim();
  // Strip characters that alter PostgREST filter syntax or break pattern matching
  const sanitized = clean.replace(/[,()\\%_]/g, "").trim();
  if (!sanitized || sanitized.length < 1) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_roster")
    .select("id, reg_no, name, department, year, college, od_slots")
    .eq("event_id", eventId)
    .or(`reg_no.ilike.%${sanitized}%,name.ilike.%${sanitized}%`)
    .limit(15);

  if (error) {
    console.error("searchRosterAction error:", error.message);
    // Fallback without od_slots in case column not migrated yet
    const fallback = await supabase
      .from("attendance_roster")
      .select("id, reg_no, name, department, year, college")
      .eq("event_id", eventId)
      .or(`reg_no.ilike.%${sanitized}%,name.ilike.%${sanitized}%`)
      .limit(15);

    if (fallback.data) {
      return fallback.data.map((d) => ({
        id: d.id,
        reg_no: d.reg_no,
        name: d.name,
        department: d.department,
        year: d.year,
        college: d.college,
        od_slots: [],
      }));
    }
    return [];
  }

  return (data ?? []).map((d) => ({
    id: d.id,
    reg_no: d.reg_no,
    name: d.name,
    department: d.department,
    year: d.year,
    college: d.college,
    od_slots: Array.isArray(d.od_slots) ? (d.od_slots as string[]) : [],
  }));
}

/** Staff records attendance for a student at a checkpoint and updates their OD slots. */
export async function staffRecordAttendanceAction(
  rosterId: number,
  checkpointId: number,
  odSlots?: string[]
): Promise<ActionState & { student?: { id: number; reg_no: string; name: string } }> {
  await requireCan("take_attendance");
  const supabase = await createClient();

  // the database records the signed-in user as the one who marked it (migration 0019)
  const { data, error } = await supabase.rpc("staff_record_attendance", {
    p_roster_id: rosterId,
    p_checkpoint_id: checkpointId,
    p_od_slots: odSlots ?? null,
  });

  if (error) return { ok: false, message: error.message };
  const res = data as {
    ok?: boolean;
    message?: string;
    student?: { id: number; reg_no: string; name: string };
  };

  revalidatePath("/attendance");
  return {
    ok: res.ok ?? true,
    message: res.message || "Attendance recorded.",
    student: res.student,
  };
}

/** Toggle manual OD override for a student who missed checkpoints. */
export async function toggleOdOverrideAction(
  rosterId: number,
  override: boolean,
  reason?: string
): Promise<ActionState> {
  await requireCan("take_attendance");
  const supabase = await createClient();

  // the database records the signed-in user as the one who changed it (migration 0019)
  const { data, error } = await supabase.rpc("toggle_od_override", {
    p_roster_id: rosterId,
    p_override: override,
    p_reason: reason || null,
  });

  if (error) return { ok: false, message: error.message };
  const res = data as { ok?: boolean; message?: string };

  revalidatePath("/attendance");
  return { ok: res.ok ?? true, message: res.message || "OD status updated." };
}
