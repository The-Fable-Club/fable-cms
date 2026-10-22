// Event questions: the rules for answering and moderating them, and the answer email.
// Pure (no database, no network) so they can be tested.

export type Question = {
  id: number;
  created_at: string;
  event_slug: string;
  question: string;
  name: string | null;
  email: string | null;
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  show_on_site: boolean;
  hidden: boolean;
  emailed_at: string | null;
};

export const QUESTION_FILTERS = ["new", "answered", "on-site", "hidden", "all"] as const;
export type QuestionFilter = (typeof QUESTION_FILTERS)[number];

export function matchesFilter(q: Question, f: QuestionFilter): boolean {
  switch (f) {
    case "new":
      return !q.hidden && !q.answer?.trim();
    case "answered":
      return !q.hidden && !!q.answer?.trim();
    case "on-site":
      return q.show_on_site && !q.hidden;
    case "hidden":
      return q.hidden;
    case "all":
      return true;
  }
}

export type AnswerEdit = { question: string; answer: string; show_on_site?: boolean; hidden?: boolean };

/**
 * Check an edit from the CMS and turn it into the columns to update.
 * `canModerate` = admin or owner: only they may change what is shown on the site or hidden.
 */
export function prepareAnswerEdit(
  current: Question,
  edit: AnswerEdit,
  opts: { by: string; canModerate: boolean; now: Date },
): { ok: true; update: Record<string, unknown> } | { ok: false; message: string } {
  const question = edit.question.trim();
  const answer = edit.answer.trim();
  if (question.length < 5 || question.length > 500) return { ok: false, message: "The question must be 5 to 500 characters." };
  if (answer.length > 2000) return { ok: false, message: "The answer can be at most 2000 characters." };

  const update: Record<string, unknown> = { question };
  const answerChanged = answer !== (current.answer ?? "").trim();
  if (answerChanged) {
    update.answer = answer || null;
    update.answered_at = answer ? opts.now.toISOString() : null;
    update.answered_by = answer ? opts.by : null;
  }

  const wantsShow = edit.show_on_site ?? current.show_on_site;
  const wantsHidden = edit.hidden ?? current.hidden;
  if (wantsShow !== current.show_on_site || wantsHidden !== current.hidden) {
    if (!opts.canModerate) return { ok: false, message: "Only admins can choose what is shown on the site or hidden." };
    update.show_on_site = wantsShow;
    update.hidden = wantsHidden;
  }
  if ((update.show_on_site ?? current.show_on_site) && !answer) return { ok: false, message: "Write an answer before showing it on the site." };
  if ((update.show_on_site ?? current.show_on_site) && (update.hidden ?? current.hidden)) return { ok: false, message: "A hidden question can't be shown on the site." };
  return { ok: true, update };
}

/** Can the asker be emailed the answer now? */
export function canEmailAnswer(q: Question): { ok: true } | { ok: false; message: string } {
  if (!q.email) return { ok: false, message: "They did not leave an email." };
  if (q.emailed_at) return { ok: false, message: "The answer was already emailed." };
  if (!q.answer?.trim()) return { ok: false, message: "Write an answer first." };
  if (q.hidden) return { ok: false, message: "This question is hidden." };
  return { ok: true };
}

/** The answer email. Plain text only: everything the asker typed is shown as text, never as HTML. */
export function answerEmail(q: Pick<Question, "question" | "answer" | "name">, eventTitle: string, eventUrl: string) {
  const greeting = q.name?.trim() ? `Hi ${q.name.trim()},` : "Hi,";
  const subject = `Your question about ${eventTitle}`.replace(/[\r\n]+/g, " ").slice(0, 150);
  const text = [
    greeting,
    "",
    `You asked about ${eventTitle}:`,
    "",
    q.question.trim().replace(/^/gm, "> "),
    "",
    (q.answer ?? "").trim(),
    "",
    `Event page: ${eventUrl}`,
    "",
    "The Fable Club, VIT Chennai",
    "You are receiving this once because you asked for the answer by email. We have now deleted your email address.",
  ].join("\n");
  return { subject, text };
}
