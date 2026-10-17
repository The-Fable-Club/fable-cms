"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { MemberRow } from "@/lib/snapshot";
import type { FormState } from "@/app/(admin)/form-state";
import { ArtPicker, Field, ModeGroup, inputCls } from "@/components/form-bits";
import { ImageField } from "@/components/image-field";

const blank: Omit<MemberRow, "id"> = {
  slug: "", name: "", role: "", group: "Member", position: 100, department: "", year_mode: "pick", year: "", bio: "", focus: [], email: "",
  show_email: false, linkedin: null, github: null, art: "sprouts", photo_path: null, archived: false,
};

export function MemberForm({ action, member }: { action: (prev: FormState, form: FormData) => Promise<FormState>; member: Omit<MemberRow, "id"> | null }) {
  const [state, formAction, pending] = useActionState(action, { errors: {} } as FormState);
  const m = member ?? blank;
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
        <Field label="Name" error={err.name}>
          <input name="name" defaultValue={m.name} required maxLength={80} className={inputCls} {...bad("name")} />
        </Field>
        <Field label="Group" hint="Where they appear on the Members page and the home page." error={err.group}>
          <select name="group" defaultValue={m.group} className={inputCls}>
            <option value="Faculty">Faculty coordinators</option>
            <option value="Board">The board</option>
            <option value="Leads">Leads</option>
            <option value="Member">Members</option>
          </select>
        </Field>
        <Field label="Role" hint='The position or category, for example "Chairperson". Empty = "Member".' error={err.role}>
          <input name="role" defaultValue={m.role} maxLength={60} className={inputCls} {...bad("role")} />
        </Field>
        <Field label="Department" error={err.department}>
          <input name="department" defaultValue={m.department} maxLength={120} className={inputCls} {...bad("department")} />
        </Field>
        <Field label="Order" hint="Smaller numbers come first." error={err.position}>
          <input type="number" name="position" defaultValue={m.position} className={inputCls} {...bad("position")} />
        </Field>
        <Field label="Web address (slug)" hint="Leave empty to make it from the name." error={err.slug}>
          <input name="slug" defaultValue={m.slug} maxLength={80} className={inputCls} {...bad("slug")} />
        </Field>
        <Field label="Focus areas" hint="Comma separated, up to 6." error={err.focus}>
          <input name="focus" defaultValue={m.focus.join(", ")} className={inputCls} />
        </Field>
      </div>

      <ModeGroup
        label="Year"
        name="year_mode"
        initial={m.year_mode}
        modes={[
          { value: "pick", label: "Pick" },
          { value: "text", label: "Write my own" },
          { value: "none", label: "Leave blank" },
        ]}
        panels={{
          pick: (
            <Field label="Year" error={err.year}>
              <select name="year" defaultValue={m.year_mode === "pick" ? m.year : "1st"} className={inputCls}>
                {["1st", "2nd", "3rd", "4th", "Postgraduate", "Alumni"].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </Field>
          ),
          text: (
            <Field label="Year (your words)" error={err.year_text}>
              <input name="year_text" defaultValue={m.year_mode === "text" ? m.year : ""} maxLength={30} className={inputCls} {...bad("year_text")} />
            </Field>
          ),
          none: <p className="text-sm text-ink/60 sm:col-span-2">No year is shown.</p>,
        }}
      />

      <Field label="Short bio" error={err.bio}>
        <textarea name="bio" defaultValue={m.bio} rows={4} maxLength={1200} className={`${inputCls} h-auto py-2`} />
      </Field>

      <fieldset className="border-2 border-ink p-4">
        <legend className="px-2 font-mono text-xs uppercase tracking-widest text-ink/60">Contact (shown on the Members page)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={err.email}>
            <input type="email" name="email" defaultValue={m.email} className={inputCls} {...bad("email")} />
          </Field>
          <label className="flex items-center gap-3 self-end pb-3">
            <input type="checkbox" name="show_email" defaultChecked={m.show_email} className="size-5 accent-[var(--color-clay-deep)]" />
            <span className="text-sm">Show the email publicly</span>
          </label>
          <Field label="LinkedIn" hint="Full link starting with https://" error={err.linkedin}>
            <input name="linkedin" defaultValue={m.linkedin ?? ""} className={inputCls} {...bad("linkedin")} />
          </Field>
          <Field label="GitHub" hint="Full link starting with https://" error={err.github}>
            <input name="github" defaultValue={m.github ?? ""} className={inputCls} {...bad("github")} />
          </Field>
        </div>
      </fieldset>

      <ImageField name="photo_path" folder="members" defaultPath={m.photo_path} label="Photo (optional)" />
      <ArtPicker defaultValue={m.art} />

      <label className="flex items-center gap-3">
        <input type="checkbox" name="archived" defaultChecked={m.archived} className="size-5 accent-[var(--color-clay-deep)]" />
        <span className="text-sm">Hide this member from the site (archive). Nothing is deleted.</span>
      </label>

      <div className="flex flex-wrap items-center gap-4 border-t-2 border-ink pt-6">
        <button type="submit" disabled={pending} className="h-11 bg-ink px-6 font-medium text-paper transition-colors hover:bg-clay-deep disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/members" className="text-sm underline underline-offset-4 hover:text-clay-deep">
          Back to members
        </Link>
        <span className="text-xs text-ink/50">Saving does not change the public site. Publish from the dashboard when you are ready.</span>
      </div>
    </form>
  );
}
