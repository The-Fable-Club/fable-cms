"use server";

import { revalidatePath } from "next/cache";
import { requireCan } from "@/lib/auth";
import { REG_NO_REGEX, parseRosterFile } from "@/lib/roster-parser";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: boolean; message: string };

function toIstIso(dt: string): string {
  if (!dt) return "";
  if (dt.includes("+") || dt.endsWith("Z")) return dt;
  // If formatted like YYYY-MM-DDTHH:mm, append seconds and +05:30 offset
  const full = dt.length === 16 ? `${dt}:00` : dt;
  return `${full}+05:30`;
}

/** Upload and process EventHub spreadsheet (.xlsx, .csv, .ods). */
export async function uploadRosterAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireCan("triage_signups");
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
    college: a.college,
    college_type: a.college_type,
    payment_status: a.payment_status,
    team_id: a.team_id,
    source: "eventhub" as const,
    flagged: false,
    imported_by: admin.username,
  }));

  // Upsert attendees into roster
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

  // Log to audit_log
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
  const admin = await requireCan("triage_signups");
  const eventId = Number(form.get("event_id"));
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, message: "Please select an event." };
  }

  const regNo = String(form.get("reg_no") || "").trim().toUpperCase();
  const name = String(form.get("name") || "").trim();
  const department = String(form.get("department") || "").trim() || null;
  const year = String(form.get("year") || "").trim() || null;
  const phone = String(form.get("phone") || "").trim().replace(/[^0-9+]/g, "") || null;

  if (!REG_NO_REGEX.test(regNo)) {
    return { ok: false, message: "Enter a valid registration number (e.g. 24BCE1078)." };
  }
  if (!name) {
    return { ok: false, message: "Student full name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("attendance_roster").insert({
    event_id: eventId,
    reg_no: regNo,
    name,
    department,
    year,
    phone,
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
    detail: { reg_no: regNo, name, department, year },
  });

  revalidatePath("/attendance");
  return { ok: true, message: `Added ${name} (${regNo}) on-spot.` };
}

/** Create or update a checkpoint with IST time parsing. */
export async function saveCheckpointAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireCan("triage_signups");
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
  await requireCan("triage_signups");
  const supabase = await createClient();
  const { error } = await supabase.from("attendance_checkpoints").delete().eq("id", checkpointId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/attendance");
  return { ok: true, message: "Checkpoint removed." };
}

/** Volunteer door check & physical ID card verification by student roster ID. */
export async function volunteerVerifyAction(rosterId: number, checkpointId?: number): Promise<ActionState> {
  await requireCan("read_signups"); // Any authenticated staff / Member can verify ID at door
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("volunteer_verify_student", {
    p_roster_id: rosterId,
    p_checkpoint_id: checkpointId || null,
  });

  if (error) return { ok: false, message: error.message };
  const res = data as { ok?: boolean; message?: string };
  revalidatePath("/attendance");
  return { ok: res.ok ?? true, message: res.message || "Student verified." };
}

/** Volunteer door check & physical ID card verification by registration number. */
export async function volunteerVerifyByRegNoAction(
  eventId: number,
  regNoRaw: string,
  checkpointId?: number
): Promise<ActionState & { student?: { name: string; reg_no: string; department?: string; year?: string } }> {
  await requireCan("read_signups");
  const regNo = regNoRaw.trim().toUpperCase();
  if (!REG_NO_REGEX.test(regNo)) {
    return { ok: false, message: `"${regNoRaw}" is not a valid VIT registration number.` };
  }

  const supabase = await createClient();
  const { data: roster, error: findErr } = await supabase
    .from("attendance_roster")
    .select("id, name, reg_no, department, year, flagged")
    .eq("event_id", eventId)
    .eq("reg_no", regNo)
    .maybeSingle();

  if (findErr) return { ok: false, message: findErr.message };
  if (!roster) {
    return { ok: false, message: `Registration number ${regNo} is not in the roster for this event.` };
  }
  if (roster.flagged) {
    return { ok: false, message: `Warning: ${roster.name} (${regNo}) is flagged as missing from the latest EventHub roster.` };
  }

  const { data, error } = await supabase.rpc("volunteer_verify_student", {
    p_roster_id: roster.id,
    p_checkpoint_id: checkpointId || null,
  });

  if (error) return { ok: false, message: error.message };
  const res = data as { ok?: boolean; message?: string };
  revalidatePath("/attendance");
  return {
    ok: res.ok ?? true,
    message: res.message || `Verified ${roster.name} (${roster.reg_no}).`,
    student: {
      name: roster.name,
      reg_no: roster.reg_no,
      department: roster.department ?? undefined,
      year: roster.year ?? undefined,
    },
  };
}
