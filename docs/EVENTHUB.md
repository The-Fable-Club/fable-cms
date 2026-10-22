# VIT EventHub and our registration

Status: **decided and planned, not built.** Written 2026-10-22. Background: [ARCHITECTURE.md](ARCHITECTURE.md), [ROADMAP.md](ROADMAP.md).

## Background
VIT Chennai requires every club event to be registered on **EventHub** (eventhubcc.vit.ac.in). It needs the student's VTOP login, takes payments and handles teams. Its interface is poor, so the club asked whether our site could serve the whole EventHub flow from our own frontend.

## Decision (2026-10-22)
- **We do not rebuild, proxy, frame or embed EventHub.** Our site never asks for, receives or forwards VTOP credentials, and never touches payments. This holds whether or not anything is stored: credentials passing through our code at all is the risk (anyone with access to the repo, Vercel or a dependency could read them), and a non-VIT page asking for VTOP passwords trains students to fall for phishing.
- **What we do instead:** every event page links to that event's official EventHub page ("Register on EventHub"). Our own registration form stays available alongside it, for on-spot sign-ups, our own head counts, and as the list attendance can hang off. It only ever asks for name, registration number, email, department, year and phone.

## Plan: the EventHub link (to build later)
Small and contained; it does not change the data contract version.

1. **Database (migration 0007):** `alter table events add column eventhub_url text` with a check that it is `null` or an `https://` URL on `eventhubcc.vit.ac.in` (so the field can only ever point at the real EventHub, not a look-alike).
2. **Contract (both repos, kept identical):** add `eventhub: httpUrl.nullable().default(null)` to `SnapshotEvent`, with a refinement that the host is `eventhubcc.vit.ac.in`. The default keeps older releases readable, so no `SCHEMA_VERSION` bump.
3. **CMS:** one optional field on the event form, "Official EventHub link", independent of the registration mode. Parser + snapshot builder pass it through; tests for accepted and refused URLs (look-alike hosts, `http://`, other domains).
4. **Site:** on the event page, a prominent **Register on EventHub** button (opens in a new tab, `rel="noopener noreferrer"`, labelled as the official VIT registration) whenever the link is set and the event is not past. Our own form, when the registration mode is "our form", is shown below it and labelled for on-spot / club sign-ups. The carousel and the home "Registrations open" announcement treat an event with an EventHub link as open for registration.
5. **Tests:** unit tests in both repos; one live publish check that the button appears on the event page after a rebuild.

## If VIT ever gives permission for a deeper integration
There is no formal procedure today, so this is what would be needed before building anything beyond a link:

- **Who approves:** the people who run VTOP/EventHub (the university's IT / central computing team), not only the faculty coordinators. Faculty coordinators can approve club activities, but they do not own the system or the students' accounts.
- **In writing:** an email is enough. It should name the club, our domain, what we would do, and that VIT accepts it. A verbal OK leaves the club with no record if something goes wrong.
- **The right shape of integration:** something where the student's password only ever goes to VIT's own page. In order of preference:
  1. an official sign-in ("Sign in with VIT" / OAuth / SSO) or an API for event registration;
  2. EventHub links that open a specific event with the student's details prefilled;
  3. an official embed provided by VIT.
- **Not a shape we build, even with an OK:** a page on our domain that collects VTOP usernames and passwords and replays them to EventHub. If that is the only option VIT offers, the link-out above remains the answer.

When one of the approved shapes exists, the plan is to build it on top of the existing pieces: the event's EventHub link becomes the integration point, our registrations table records the confirmation, and attendance (see [ATTENDANCE-FEASIBILITY.md](ATTENDANCE-FEASIBILITY.md)) uses it.
