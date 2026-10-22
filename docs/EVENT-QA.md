# Event questions and FAQ

Status: **planned, not built.** Written 2026-10-22. Background: [ARCHITECTURE.md](ARCHITECTURE.md). Fits the existing rules: no student accounts, static public pages, sign-ups are insert-only.

## What the club wants
Under each event on our site, anyone can **ask a question**. Questions arrive **only in the CMS** (never shown on the site automatically). Staff **answer in the CMS** and **choose** whether a question and its answer appear on the event page as an FAQ.

## The flow
1. **Ask (site):** a small form on the event page: question (required, up to ~500 characters), optional name, optional email (see "Telling them the answer"). Same protections as registrations: same-origin check, size limit, honeypot, validation, and a per-device/per-email and global rate limit in the database. Insert-only with the public key; the site never reads questions back.
2. **Triage (CMS):** a Questions inbox per event and across events: new / answered / published / hidden. Staff write an answer, can **edit the question text before publishing** (to fix typos or strip personal details), and tick **Show on site**.
3. **Publish (site):** answered questions marked "Show on site" go into the release with the event (a new `faq: [{ question, answer }]` list on the event, added to the data contract with a default so old releases stay valid). They appear on the event page after the next Publish, like every other change.

Nothing a visitor types reaches the public site without a person approving it.

## Telling them the answer (no accounts)
Options, which can be combined:

| Option | How | Trade-offs |
|---|---|---|
| **A. Private answer link** (recommended) | After asking, the page shows a link with an unguessable code (e.g. `thefableclub.com/q/8f3k…`) and says "keep this link to see the answer". The page asks the database for **that one question only** through a function that returns its answer by code and nothing else. | No personal data needed. They have to come back and check; a lost link means a lost answer. |
| **B. Optional email** | They may leave an email (with a tick box "email me the answer"). When staff answer, the CMS sends one email with the answer. The email is deleted once the answer is sent (or after the event). | Needs an email-sending service (a free tier such as Resend, or Supabase's SMTP setting) and a sender address on thefableclub.com (SPF/DKIM). Email is personal data: store it only for this. |
| **C. Published FAQ** | If the answer is useful to everyone, it appears on the event page. | Only works for questions worth publishing. |

Recommendation: **A always, B as an optional tick box, C when useful.** Do not require an email.

## Who can do what (fits [ACCESS.md](ACCESS.md))
- **Member:** read questions.
- **Creator:** also draft answers.
- **Admin / owner:** also send answers (emails), mark "Show on site", hide spam, and publish.

## Safety notes
- Questions are untrusted text: shown in the CMS as plain text only, never as HTML.
- The answer page (`/q/<code>`) reveals only that question, its answer and the event title; codes are long random values, not counters.
- Spam: rate limits, honeypot, a length limit, and a "hide" action; repeated abuse from one email can be blocked.
- Retention: delete unanswered and hidden questions some time after the event (decide how long), and emails as soon as they are no longer needed.

## Open questions for the club
- Should askers be able to add a name, or keep questions anonymous?
- Do we want the email option (B) now, or start with the private link only?
- How long to keep questions after an event?
