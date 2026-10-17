"use client";

import { useActionState } from "react";
import Link from "next/link";
import { monthLabel } from "@/lib/event-logic";
import { can, type Role } from "@/lib/roles";
import type { EventRow } from "@/lib/snapshot";
import type { FormState } from "@/app/(admin)/form-state";
import { ArtPicker, Field, ModeGroup, inputCls } from "@/components/form-bits";
import { HubEditor } from "@/components/hub-editor";
import { ImageField } from "@/components/image-field";

type Props = {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  event: Omit<EventRow, "id"> | null;
  author: string;
  role: Role;
};

const blank: Omit<EventRow, "id"> = {
  slug: "", title: "", kind: "Workshop", phase: 1, status_override: null, date_mode: "exact", start_date: null, end_date: null, date_month: null,
  date_text: null, time_mode: "text", time_text: "", venue_mode: "text", venue: "", seats_mode: "open", seats: null, apply_mode: "none",
  apply_url: null, summary: "", description: "", highlights: [], art: "sprouts", photo_path: null, hub: [], archived: false, draft: true,
};

export function EventForm({ action, event, author, role }: Props) {
  const [state, formAction, pending] = useActionState(action, { errors: {} } as FormState);
  const e = event ?? blank;
  // Events saved with the old "month only" option open as "write my own", with the month as the text and a placeholder place.
  const dateStart =
    e.date_mode === "month" && e.date_month
      ? { mode: "text" as const, text: monthLabel(e.date_month), place: `${e.date_month}-15` }
      : { mode: e.date_mode, text: e.date_text ?? "", place: e.start_date ?? "" };
  const err = state.errors;
  const bad = (k: string) => (err[k] ? { "aria-invalid": true as const } : {});

  return (
    <form action={formAction} className="space-y-6">
      {state.message && (
        <p role="alert" className="border-2 border-clay-deep p-3 text-sm">
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" error={err.title} className="sm:col-span-2">
          <input name="title" defaultValue={e.title} required maxLength={120} className={inputCls} {...bad("title")} />
        </Field>
        <Field label="Kind" hint="Workshop, Talk, Hackathon…" error={err.kind}>
          <input name="kind" defaultValue={e.kind} maxLength={40} className={inputCls} {...bad("kind")} />
        </Field>
        <Field label="Phase" hint="0 = no phase" error={err.phase}>
          <select name="phase" defaultValue={String(e.phase)} className={inputCls} {...bad("phase")}>
            {[0, 1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {p === 0 ? "No phase" : `Phase ${p}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Web address (slug)" hint="Leave empty to make it from the title. Changing it later breaks old links." error={err.slug}>
          <input name="slug" defaultValue={e.slug} maxLength={80} className={inputCls} {...bad("slug")} />
        </Field>
        <Field label="Status" hint="Automatic follows the dates. Only change it if the dates are not enough." error={err.status_override}>
          <select name="status_override" defaultValue={e.status_override ?? ""} className={inputCls}>
            <option value="">Automatic (from the date)</option>
            <option value="active">Live now</option>
            <option value="upcoming">Open / upcoming</option>
            <option value="past">Past</option>
          </select>
        </Field>
      </div>

      <Field label="Short summary" hint="One or two sentences, shown on cards." error={err.summary}>
        <textarea name="summary" defaultValue={e.summary} rows={2} maxLength={400} className={`${inputCls} h-auto py-2`} {...bad("summary")} />
      </Field>

      <ModeGroup
        label="Date"
        name="date_mode"
        initial={dateStart.mode}
        error={err.date_mode}
        modes={[
          { value: "exact", label: "Exact date" },
          { value: "text", label: "Write my own" },
          { value: "tba", label: "To be announced" },
        ]}
        panels={{
          exact: (
            <>
              <Field label="Start" error={err.start_date}>
                <input type="date" name="start_date" defaultValue={dateStart.mode === "exact" ? (e.start_date ?? "") : ""} className={inputCls} {...bad("start_date")} />
              </Field>
              <Field label="End (if it runs several days)" error={err.end_date}>
                <input type="date" name="end_date" defaultValue={e.end_date ?? ""} className={inputCls} {...bad("end_date")} />
              </Field>
            </>
          ),
          text: (
            <>
              <Field label="Date text" hint='Shown exactly as written, for example "Early February".' error={err.date_text}>
                <input name="date_text" defaultValue={dateStart.text} maxLength={80} className={inputCls} {...bad("date_text")} />
              </Field>
              <Field label="Place it on the timeline at (optional)" hint="A placeholder date only used to position it. It is never shown." error={err.date_place}>
                <input type="date" name="date_place_text" defaultValue={dateStart.mode === "text" ? dateStart.place : ""} className={inputCls} />
              </Field>
            </>
          ),
          tba: (
            <Field label="Place it on the timeline at (optional)" hint='A placeholder date only used to position it. It still says "Date to be announced". Leave empty to list it under the timeline instead.' error={err.date_place} className="sm:col-span-2">
              <input type="date" name="date_place_tba" defaultValue={dateStart.mode === "tba" ? dateStart.place : ""} className={inputCls} />
            </Field>
          ),
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ModeGroup
          label="Time"
          name="time_mode"
          initial={e.time_mode}
          modes={[
            { value: "text", label: "Write it" },
            { value: "tba", label: "To be announced" },
          ]}
          panels={{
            text: (
              <Field label="Time" hint='For example "4:00 – 6:00 pm".' error={err.time_text} className="sm:col-span-2">
                <input name="time_text" defaultValue={e.time_text} maxLength={60} className={inputCls} {...bad("time_text")} />
              </Field>
            ),
            tba: <p className="text-sm text-ink/60 sm:col-span-2">&ldquo;Time to be announced&rdquo;</p>,
          }}
        />
        <ModeGroup
          label="Venue"
          name="venue_mode"
          initial={e.venue_mode}
          modes={[
            { value: "text", label: "Write it" },
            { value: "online", label: "Online" },
            { value: "tba", label: "To be announced" },
          ]}
          panels={{
            text: (
              <Field label="Venue" error={err.venue} className="sm:col-span-2">
                <input name="venue" defaultValue={e.venue} maxLength={120} className={inputCls} {...bad("venue")} />
              </Field>
            ),
            online: (
              <Field label="Where online (optional)" hint="Platform name, for example Google Meet. Put the link in the hub." className="sm:col-span-2">
                <input name="venue_online" defaultValue={e.venue_mode === "online" ? e.venue : ""} maxLength={120} className={inputCls} />
              </Field>
            ),
            tba: <p className="text-sm text-ink/60 sm:col-span-2">&ldquo;Venue to be announced&rdquo;</p>,
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ModeGroup
          label="Who can join / seats"
          name="seats_mode"
          initial={e.seats_mode}
          modes={[
            { value: "text", label: "Write it" },
            { value: "open", label: "Open to all" },
            { value: "tba", label: "To be announced" },
          ]}
          panels={{
            text: (
              <Field label="Seats or audience" hint='For example "60 seats" or "1st years only".' error={err.seats} className="sm:col-span-2">
                <input name="seats" defaultValue={e.seats ?? ""} maxLength={80} className={inputCls} {...bad("seats")} />
              </Field>
            ),
            open: <p className="text-sm text-ink/60 sm:col-span-2">&ldquo;Open to all&rdquo;</p>,
            tba: <p className="text-sm text-ink/60 sm:col-span-2">&ldquo;To be announced&rdquo;</p>,
          }}
        />
        <ModeGroup
          label="Registration"
          name="apply_mode"
          initial={e.apply_mode}
          modes={[
            { value: "form", label: "Our form" },
            { value: "link", label: "Outside link" },
            { value: "soon", label: "Opening soon" },
            { value: "closed", label: "Closed" },
            { value: "none", label: "Not needed" },
          ]}
          panels={{
            form: <p className="text-sm text-ink/60 sm:col-span-2">A registration form appears on the event page. Sign-ups show up under Registrations here. It closes by itself when the event is over.</p>,
            link: (
              <Field label="Link" hint="Starts with https://" error={err.apply_url} className="sm:col-span-2">
                <input name="apply_url" defaultValue={e.apply_url ?? ""} className={inputCls} {...bad("apply_url")} />
              </Field>
            ),
            soon: <p className="text-sm text-ink/60 sm:col-span-2">&ldquo;Registration opens soon&rdquo; is shown instead of a button.</p>,
            closed: <p className="text-sm text-ink/60 sm:col-span-2">&ldquo;Registration is closed&rdquo; is shown.</p>,
            none: <p className="text-sm text-ink/60 sm:col-span-2">No registration button at all.</p>,
          }}
        />
      </div>

      <Field label="Description" hint="Separate paragraphs with an empty line." error={err.description}>
        <textarea name="description" defaultValue={e.description} rows={7} className={`${inputCls} h-auto py-2`} />
      </Field>
      <Field label="Highlights" hint="One per line (up to 8)." error={err.highlights}>
        <textarea name="highlights" defaultValue={e.highlights.join("\n")} rows={4} className={`${inputCls} h-auto py-2`} />
      </Field>

      <ImageField name="photo_path" folder="events" defaultPath={e.photo_path} label="Photo (optional)" />
      <ArtPicker defaultValue={e.art} />
      <HubEditor initial={Array.isArray(e.hub) ? (e.hub as never[]) : []} author={author} error={err.hub} />

      <div className="border-2 border-ink p-4">
        {can(role, "edit_live_events") ? (
          <label className="flex items-start gap-3">
            <input type="checkbox" name="draft" defaultChecked={e.draft ?? false} className="mt-1 size-5 accent-[var(--color-clay-deep)]" />
            <span className="text-sm">
              <strong>Draft.</strong> Saved but never published. Untick it to let this event go out with the next publish.
            </span>
          </label>
        ) : (
          <>
            <input type="hidden" name="draft" value="on" />
            <p className="text-sm">
              <strong>Draft.</strong> You can save events as drafts. An admin reviews and takes them live.
            </p>
          </>
        )}
      </div>

      <label className="flex items-center gap-3">
        <input type="checkbox" name="archived" defaultChecked={e.archived} className="size-5 accent-[var(--color-clay-deep)]" />
        <span className="text-sm">Hide this event from the site (archive). Nothing is deleted.</span>
      </label>

      <div className="flex flex-wrap items-center gap-4 border-t-2 border-ink pt-6">
        <button type="submit" disabled={pending} className="h-11 bg-ink px-6 font-medium text-paper transition-colors hover:bg-clay-deep disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/events" className="text-sm underline underline-offset-4 hover:text-clay-deep">
          Back to events
        </Link>
        <span className="text-xs text-ink/50">Saving does not change the public site. Publish from the dashboard when you are ready.</span>
      </div>
    </form>
  );
}
