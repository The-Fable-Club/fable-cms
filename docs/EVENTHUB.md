# VIT EventHub and our registration

Status: **decided and planned, not built.** Updated 2026-10-22. Background: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md).

## Background
VIT Chennai requires every club event to be registered on **EventHub** (eventhubcc.vit.ac.in). It needs the student's VTOP login, takes payments and handles teams. The club gets the list of registered students from EventHub **as a CSV, on event day**.

## Decisions (2026-10-22)
- **EventHub stays the official registration. We link to it; nothing more.** Our site never asks for, receives or forwards VTOP credentials, and never touches payments. No deeper integration is planned (getting a formal exception from the university is unlikely and slow; revisit only if VIT offers an official sign-in, API or embed, and then only in a shape where the password goes to VIT's own page).
- **No student accounts of our own.** Students never sign in to our site.
- **The participant hub stays public** (anyone with the event's hub link can open it), so participants can download materials without an account. Consequence: never post anything private in a hub.
- **Our own registration form stays for now** (for on-spot sign-ups and our own counts); it may be removed later after the club's leadership decides.

## Plan: the EventHub link (to build)
1. **Database (migration 0007):** `alter table events add column eventhub_url text`, checked to be `null` or an `https://` URL on `eventhubcc.vit.ac.in` (so it can only point at the real EventHub, not a look-alike).
2. **Contract (both repos, identical):** `eventhub: httpUrl.nullable().default(null)` on `SnapshotEvent`, host must be `eventhubcc.vit.ac.in`. The default keeps old releases readable, so no `SCHEMA_VERSION` bump.
3. **CMS:** one optional field on the event form, "Official EventHub link", independent of the registration mode. Tests for accepted and refused URLs (look-alike hosts, `http://`, other domains).
4. **Site:** on the event page, a prominent **Register on EventHub** button (new tab, `rel="noopener noreferrer"`, labelled as the official VIT registration) while the event is not past. Our own form, if enabled, sits below it, labelled for on-spot / club sign-ups. The carousel and the home "Registrations open" announcement count an event with an EventHub link as open for registration.
5. **Tests:** unit tests in both repos; one live publish check that the button appears after a rebuild.

## Can we know who registered on EventHub before event day?
**Not reliably, without access to EventHub's own data.** Only EventHub knows who completed registration (and payment). Options, best first:

1. **Ask for earlier exports or organiser access.** If EventHub (or the club's faculty coordinator account) can download the registrant list before event day, import it whenever available (the import below is built to be repeated). This is the only option that is actually verified.
2. **Self-confirmation on our site (optional).** After registering on EventHub, a student enters their registration number (and, if EventHub shows one, the confirmation or receipt number) on our event page. It is **not proof**, only a claim, but it gives an early head count and is checked against the official CSV on event day; claims with no match are flagged. It asks for nothing sensitive.
3. **Don't**: ask students to upload screenshots or receipts (personal data, storage, easy to fake) or log in to EventHub on their behalf.

Recommendation: ask for option 1; add option 2 only if an early head count matters.
