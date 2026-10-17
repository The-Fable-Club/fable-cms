// THE DATA CONTRACT between the CMS and the public site.
//
// A release is one JSON snapshot. The CMS validates it before saving; the
// site validates it again at build time and fails the build rather than
// publishing broken pages. This file is copied verbatim into the site repo
// (src/lib/contract.ts): change both together and bump SCHEMA_VERSION when
// the shape changes in a way the site must know about.
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

function isRealDate(s: string) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine(isRealDate, "That date doesn't exist");
export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM");
export const slugStr = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lower-case letters, numbers and hyphens only")
  .max(80);
const shortText = (max: number) => z.string().trim().min(1, "Required").max(max, `At most ${max} characters`);
const httpUrl = z
  .string()
  .url("Must be a full link starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Must start with http:// or https://");

// ---------------------------------------------------------------------------
// "Not decided yet" details. Each uncertain field carries a mode, so the site
// always knows whether it has a real value, a placeholder or nothing.

export const DateInfo = z.discriminatedUnion("mode", [
  z
    .object({ mode: z.literal("exact"), start: isoDate, end: isoDate.nullish() })
    .refine((d) => !d.end || d.end >= d.start, { message: "The end date is before the start date", path: ["end"] }),
  z.object({ mode: z.literal("month"), month: monthStr }),
  // "month" is a legacy mode: the editor no longer offers it ("text" or "tba" with a placeholder place replaces it),
  // but old releases that contain it stay readable.
  // `place` positions the event on the timeline without showing a date: the label stays as written / "to be announced".
  z.object({ mode: z.literal("text"), text: shortText(80), month: monthStr.nullish(), place: isoDate.nullish() }),
  z.object({ mode: z.literal("tba"), place: isoDate.nullish() }),
]);
export type DateInfo = z.infer<typeof DateInfo>;

export const TimeInfo = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("text"), text: shortText(60) }),
  z.object({ mode: z.literal("tba") }),
]);
export type TimeInfo = z.infer<typeof TimeInfo>;

export const VenueInfo = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("text"), text: shortText(120) }),
  z.object({ mode: z.literal("online"), text: z.string().trim().max(120).nullish() }),
  z.object({ mode: z.literal("tba") }),
]);
export type VenueInfo = z.infer<typeof VenueInfo>;

export const SeatsInfo = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("text"), text: shortText(80) }),
  z.object({ mode: z.literal("open") }),
  z.object({ mode: z.literal("tba") }),
]);
export type SeatsInfo = z.infer<typeof SeatsInfo>;

/** form = our own registration form (written to the database); link = an outside form. */
export const ApplyInfo = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("form") }),
  z.object({ mode: z.literal("link"), url: httpUrl }),
  z.object({ mode: z.literal("soon") }),
  z.object({ mode: z.literal("closed") }),
  z.object({ mode: z.literal("none") }),
]);
export type ApplyInfo = z.infer<typeof ApplyInfo>;

export const YearInfo = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("pick"), text: shortText(30) }),
  z.object({ mode: z.literal("text"), text: shortText(30) }),
  z.object({ mode: z.literal("none") }),
]);
export type YearInfo = z.infer<typeof YearInfo>;

// ---------------------------------------------------------------------------

export const HubItem = z.object({
  kind: z.enum(["announcement", "link", "file", "schedule"]),
  title: shortText(120),
  body: z.string().trim().max(2000).nullish(),
  href: httpUrl.nullish(),
  posted_at: isoDate,
  posted_by: shortText(60),
});
export type HubItem = z.infer<typeof HubItem>;

export const EventStatusOverride = z.enum(["active", "upcoming", "past"]);

export const SnapshotEvent = z.object({
  slug: slugStr,
  title: shortText(120),
  kind: shortText(40),
  phase: z.number().int().min(0).max(4),
  status_override: EventStatusOverride.nullable(),
  date: DateInfo,
  time: TimeInfo,
  venue: VenueInfo,
  seats: SeatsInfo,
  apply: ApplyInfo,
  summary: shortText(400),
  description: z.array(shortText(2000)).max(12),
  highlights: z.array(shortText(120)).max(8),
  art: slugStr,
  photo: httpUrl.nullable(),
  hub: z.array(HubItem).max(60),
});
export type SnapshotEvent = z.infer<typeof SnapshotEvent>;

export const MemberGroup = z.enum(["Faculty", "Board", "Leads", "Member"]);
export type MemberGroup = z.infer<typeof MemberGroup>;

export const SnapshotMember = z.object({
  slug: slugStr,
  name: shortText(80),
  role: shortText(60),
  // Added after the first release shape; defaults keep older releases readable.
  group: MemberGroup.default("Member"),
  order: z.number().int().min(0).max(100000).default(100),
  department: z.string().trim().max(120),
  year: YearInfo,
  bio: z.string().trim().max(1200),
  focus: z.array(shortText(40)).max(6),
  links: z.object({
    email: z.string().email().nullish(),
    linkedin: httpUrl.nullish(),
    github: httpUrl.nullish(),
  }),
  art: slugStr,
  photo: httpUrl.nullable(),
});
export type SnapshotMember = z.infer<typeof SnapshotMember>;

export const Snapshot = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    generated_at: z.string().datetime(),
    events: z.array(SnapshotEvent),
    members: z.array(SnapshotMember),
  })
  .superRefine((s, ctx) => {
    for (const [key, list] of [
      ["events", s.events],
      ["members", s.members],
    ] as const) {
      const seen = new Set<string>();
      list.forEach((item, i) => {
        if (seen.has(item.slug)) ctx.addIssue({ code: "custom", message: `Duplicate slug "${item.slug}"`, path: [key, i, "slug"] });
        seen.add(item.slug);
      });
    }
  });
export type Snapshot = z.infer<typeof Snapshot>;
