"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCan } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { answerEmail, canEmailAnswer, prepareAnswerEdit, type Question } from "@/lib/questions";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const SITE = "https://www.thefableclub.com";

function back(form: FormData, msg: string): never {
  const filter = String(form.get("filter") ?? "new");
  redirect(`/questions?filter=${encodeURIComponent(filter)}&msg=${encodeURIComponent(msg)}#q-${Number(form.get("id"))}`);
}

async function load(id: number) {
  const supabase = await createClient();
  const { data } = await supabase.from("event_questions").select("*").eq("id", id).maybeSingle();
  return { supabase, q: data as Question | null };
}

/** Save the answer (creators and up) and, for admins, whether it is shown on the site or hidden. */
export async function saveAnswerAction(form: FormData) {
  const me = await requireCan("answer_questions");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const { supabase, q } = await load(id);
  if (!q) back(form, "That question no longer exists.");

  const moderate = can(me.role, "moderate_questions");
  const result = prepareAnswerEdit(
    q,
    {
      question: String(form.get("question") ?? ""),
      answer: String(form.get("answer") ?? ""),
      ...(moderate ? { show_on_site: form.get("show_on_site") === "on", hidden: form.get("hidden") === "on" } : {}),
    },
    { by: me.username, canModerate: moderate, now: new Date() },
  );
  if (!result.ok) back(form, result.message);

  const { error } = await supabase.from("event_questions").update(result.update).eq("id", id);
  revalidatePath("/questions");
  revalidatePath("/");
  back(form, error ? `Not saved: ${error.message}` : "Saved. Shown answers go live with the next Publish.");
}

/** Email the answer (admins). Sends through Resend when configured; the email address is deleted afterwards. */
export async function emailAnswerAction(form: FormData) {
  await requireCan("moderate_questions");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const { supabase, q } = await load(id);
  if (!q) back(form, "That question no longer exists.");
  const check = canEmailAnswer(q);
  if (!check.ok) back(form, check.message);

  const { data: ev } = await supabase.from("events").select("title").eq("slug", q.event_slug).maybeSingle();
  const mail = answerEmail(q, ev?.title ?? q.event_slug, `${SITE}/events/${q.event_slug}`);
  const sent = await sendMail(q.email!, mail.subject, mail.text);
  if (!sent.ok) back(form, sent.reason === "not_configured" ? "Email sending is not set up. Use the mailto link, then 'Mark as emailed'." : `Not sent: ${sent.message}`);

  await supabase.from("event_questions").update({ emailed_at: new Date().toISOString(), email: null }).eq("id", id);
  revalidatePath("/questions");
  back(form, "Answer emailed. Their email address has been deleted.");
}

/** After sending by hand (mailto), record it and delete the address. */
export async function markEmailedAction(form: FormData) {
  await requireCan("moderate_questions");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const { supabase, q } = await load(id);
  if (!q) back(form, "That question no longer exists.");
  if (!q.email) back(form, "There is no email to mark.");
  await supabase.from("event_questions").update({ emailed_at: new Date().toISOString(), email: null }).eq("id", id);
  revalidatePath("/questions");
  back(form, "Marked as emailed. Their email address has been deleted.");
}

/** Delete a question for good (admins). Shown answers disappear from the site with the next Publish. */
export async function deleteQuestionAction(form: FormData) {
  await requireCan("moderate_questions");
  const id = Number(form.get("id"));
  if (!Number.isInteger(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("event_questions").delete().eq("id", id);
  revalidatePath("/questions");
  back(form, error ? `Not deleted: ${error.message}` : "Deleted.");
}
