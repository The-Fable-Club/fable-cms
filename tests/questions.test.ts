import { describe, expect, it } from "vitest";
import { answerEmail, canEmailAnswer, matchesFilter, prepareAnswerEdit, type Question } from "@/lib/questions";

const now = new Date("2026-10-22T10:00:00Z");
const q = (o: Partial<Question> = {}): Question => ({
  id: 1, created_at: "2026-10-21T10:00:00Z", event_slug: "e", question: "Is it free to attend?", name: null, email: null,
  answer: null, answered_at: null, answered_by: null, show_on_site: false, hidden: false, emailed_at: null, ...o,
});
const edit = (cur: Question, e: Parameters<typeof prepareAnswerEdit>[1], canModerate = true) => prepareAnswerEdit(cur, e, { by: "haise-727", canModerate, now });

describe("filters", () => {
  it("sorts questions into new, answered, on site, hidden", () => {
    expect(matchesFilter(q(), "new")).toBe(true);
    expect(matchesFilter(q({ answer: "  " }), "new")).toBe(true);
    expect(matchesFilter(q({ answer: "Yes" }), "answered")).toBe(true);
    expect(matchesFilter(q({ answer: "Yes", show_on_site: true }), "on-site")).toBe(true);
    expect(matchesFilter(q({ hidden: true }), "hidden")).toBe(true);
    expect(matchesFilter(q({ hidden: true }), "new")).toBe(false);
    expect(matchesFilter(q({ hidden: true, answer: "x", show_on_site: true }), "on-site")).toBe(false);
  });
});

describe("prepareAnswerEdit", () => {
  it("records who answered and when", () => {
    const r = edit(q(), { question: "Is it free to attend?", answer: " Yes, free. " });
    expect(r).toEqual({ ok: true, update: { question: "Is it free to attend?", answer: "Yes, free.", answered_at: now.toISOString(), answered_by: "haise-727" } });
  });
  it("does not touch the answer stamp when only the question wording changes", () => {
    const r = edit(q({ answer: "Yes" }), { question: "Is the event free?", answer: "Yes" });
    expect(r).toEqual({ ok: true, update: { question: "Is the event free?" } });
  });
  it("clearing the answer clears the stamp", () => {
    const r = edit(q({ answer: "Yes", answered_by: "x", answered_at: "t" }), { question: "Is it free to attend?", answer: "" });
    expect(r.ok && r.update).toMatchObject({ answer: null, answered_at: null, answered_by: null });
  });
  it("creators can answer but not publish or hide", () => {
    expect(edit(q(), { question: "Is it free to attend?", answer: "Yes" }, false).ok).toBe(true);
    expect(edit(q({ answer: "Yes" }), { question: "Is it free to attend?", answer: "Yes", show_on_site: true }, false).ok).toBe(false);
    expect(edit(q(), { question: "Is it free to attend?", answer: "", hidden: true }, false).ok).toBe(false);
  });
  it("admins can show an answered question on the site", () => {
    const r = edit(q({ answer: "Yes" }), { question: "Is it free to attend?", answer: "Yes", show_on_site: true, hidden: false });
    expect(r.ok && r.update).toMatchObject({ show_on_site: true, hidden: false });
  });
  it("refuses to show an unanswered or hidden question", () => {
    expect(edit(q(), { question: "Is it free to attend?", answer: "", show_on_site: true }).ok).toBe(false);
    expect(edit(q({ answer: "Yes" }), { question: "Is it free to attend?", answer: "Yes", show_on_site: true, hidden: true }).ok).toBe(false);
    // clearing the answer of a shown question is refused too
    expect(edit(q({ answer: "Yes", show_on_site: true }), { question: "Is it free to attend?", answer: "" }).ok).toBe(false);
  });
  it("checks lengths", () => {
    expect(edit(q(), { question: "Hi", answer: "" }).ok).toBe(false);
    expect(edit(q(), { question: "Is it free to attend?", answer: "x".repeat(2001) }).ok).toBe(false);
  });
});

describe("emailing the answer", () => {
  it("only when there is an email, an answer, it is not hidden and not already sent", () => {
    expect(canEmailAnswer(q({ email: "a@b.co", answer: "Yes" })).ok).toBe(true);
    expect(canEmailAnswer(q({ answer: "Yes" })).ok).toBe(false);
    expect(canEmailAnswer(q({ email: "a@b.co" })).ok).toBe(false);
    expect(canEmailAnswer(q({ email: "a@b.co", answer: "Yes", emailed_at: "t" })).ok).toBe(false);
    expect(canEmailAnswer(q({ email: "a@b.co", answer: "Yes", hidden: true })).ok).toBe(false);
  });
  it("builds a plain-text email that quotes the question and cannot break the subject line", () => {
    const m = answerEmail({ question: "Line one\nline two", answer: "Yes.", name: " Ada " }, "Prompt\r\nBcc: x@evil.example", "https://www.thefableclub.com/events/e");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).toContain("Hi Ada,");
    expect(m.text).toContain("> Line one\n> line two");
    expect(m.text).toContain("Yes.");
    expect(m.text).toContain("https://www.thefableclub.com/events/e");
    expect(answerEmail({ question: "Q", answer: "A", name: null }, "T", "u").text.startsWith("Hi,")).toBe(true);
  });
});
