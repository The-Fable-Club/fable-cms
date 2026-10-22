# Event attendance (for OD): is it feasible?

Status: **feasibility note only, not a plan and not built.** Written 2026-10-22 for whoever picks this up. Read [ARCHITECTURE.md](ARCHITECTURE.md) first.

## What the club wants
After people register and turn up, take **several attendance marks per event** (for example: arrival, a mid-event check, leaving, end of event), so OD is given only to people who were actually there for the required parts. Today this is done by collecting registration numbers into an Excel sheet. The goal is to move it to the website **and stop proxies** (a friend marking for someone) and people claiming OD without attending.

## Verdict
**Feasible, and it fits the current system well.** Attendance is a live write, exactly like registrations: a small, validated insert into Supabase, with the CMS reading it. Nothing about it needs the public pages to stop being static.

**Limit to be honest about:** no purely online method can *prove* that the person holding a phone is the registered student. Every remote-only check can be beaten by handing the phone or the link to a friend who is in the room. Proxy-resistance comes from combining a check that requires **being in the room at that moment** with a check that ties the mark to **one person and one device**, plus a little human verification. Done that way it is far stronger than an Excel sheet.

## Building blocks (pick a combination)

| Technique | Stops | Weakness |
|---|---|---|
| **Rotating code on the organiser's screen** (QR or short code that changes every ~15-30 s, signed by the server, valid only during that checkpoint's window) | Marking from outside the room; sharing a screenshot or code later | Someone inside can relay the live code to a friend outside in real time (short validity makes this hard, not impossible) |
| **Checkpoint windows** (each mark only accepted in its time slot: e.g. arrival 9:00-9:20, exit 12:40-13:00) | Marking everything at once; marking after the event | None on its own; it is a constraint, not a proof |
| **One mark per registration per checkpoint, and only for registered people** (reg number must match a registration for that event; database unique key) | Unregistered people; double marking | Doesn't stop a proxy who knows the friend's reg number |
| **Device binding** (first mark stores a random device token; later marks for that registration must come from the same device; one device cannot mark for two registrations) | One phone marking for several friends | A determined proxy can use the friend's own phone |
| **Organiser scans the student instead** (student shows a personal QR from their registration; a volunteer scans it at the door after a glance at the ID card) | Almost all proxying, because a person checks a face and ID | Slower at the door; needs volunteers with a scanner page |
| **Random spot checks** (volunteers ask a few marked people to show ID mid-event; a mismatch voids that person's OD) | Makes proxying risky even when possible | Needs a little volunteer time |
| **Location (GPS)** | Casual remote marking | Easy to spoof, unreliable indoors, privacy cost. Do not rely on it. |

**Recommended combination:** rotating code + checkpoint windows + registration match + device binding for the quick marks, and a **volunteer-scanned check with ID at least once** (arrival is natural), plus random spot checks. OD = present at every required checkpoint.

## How it would fit the existing system (for orientation, not a design)
- **Data:** an `attendance_checkpoints` list per event (label, opens, closes, required for OD) and an `attendance_marks` table (registration, checkpoint, time, how marked, device token). The registration number links marks to the existing `registrations` table.
- **Writes:** like `/api/registrations`: a site route that validates, then inserts with the public key under row level security (insert only, checkpoint must be open, code must be valid). Code signing needs a server-side secret, so code checks happen in the route or a database function, never in the browser.
- **CMS:** a checkpoint editor on the event, a live "presenter" screen that shows the rotating code, a volunteer scanner page, and an OD report (who met every required checkpoint) with CSV export, matching the current Excel output.
- **Who can do what:** decide which access level runs the door (probably **Member** for scanning/presenting, **Admin** for editing checkpoints and finalising OD). The current role system ([ACCESS.md](ACCESS.md)) supports adding this.
- **Privacy:** attendance + reg numbers are personal data. Keep them out of releases (never published), readable only in the CMS, and decide how long to keep them.

## Open questions for the club
- Which checkpoints count for OD, and does missing one cancel OD or reduce it?
- Will volunteers be available at the door for an ID check?
- Does the university require a particular OD format? (Keep the CSV close to the current Excel.)
- How long must attendance records be kept?
