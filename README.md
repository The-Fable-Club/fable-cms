# Fable Club CMS

The admin app for The Fable Club's website, at **cms.thefableclub.com**. Editors sign in with GitHub, manage events, people and sign-ups, and press **Publish**, which rebuilds the public site once from the database. Visitors never read the database while browsing.

Separate from the public site on purpose: [The-Fable-Club/fable-site](https://github.com/The-Fable-Club/fable-site).

## Read first
| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How everything connects, the data flows, security, tests, status report |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is done, what is left, suggestions |
| [docs/ACCESS.md](docs/ACCESS.md) | The four access levels (member, creator, admin, owner), who has them, GitHub teams |
| [docs/INTEGRATION-PLAN.md](docs/INTEGRATION-PLAN.md) | Design decisions and the running progress log |
| [docs/DEPLOY.md](docs/DEPLOY.md), [docs/SETUP.md](docs/SETUP.md) | How Vercel and GitHub sign-in were set up |
| [supabase/migrations/](supabase/migrations/) | The database, in order (see its README for what is applied) |

## Run it
```bash
npm install
cp .env.example .env.local     # fill in; secrets never go in chat or git
npm run dev -- -p 3001
npm test                       # unit tests
npm run test:live              # tests against the real project (see ARCHITECTURE section 8)
```
Localhost uses the **same database** as the live CMS: what you save or add there is real and appears on cms.thefableclub.com too. Publishing from either rebuilds the live site.

## Useful scripts
`npm run seed` (placeholder content) · `npx tsx scripts/import-board.mts` (one-off board import) · `npx tsx scripts/publish-now.mts "note"` (publish from the terminal) · `node scripts/db.mjs --file x.sql` (run SQL; needs `DATABASE_URL`).
