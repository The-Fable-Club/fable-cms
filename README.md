# Fable Club CMS (private)

Admin app for The Fable Club's website. Separate from the public site repo on purpose.

- Plan and decisions: [docs/PLAN.md](docs/PLAN.md)
- Database: [supabase/migrations/](supabase/migrations/) (0001 applied, see its README)
- Turning on sign-in: [docs/SETUP.md](docs/SETUP.md)
- Environment: copy `.env.example` to `.env.local` and fill it in. Secrets never go in chat or in git.

Status: the database baseline is applied; the app has GitHub sign-in (database-checked admins), a dashboard with live counts, a health check and security headers. Next: publishing (needs the Vercel deploy hook), then the editing screens.

Run locally: `npm run dev -- -p 3200` (needs `.env.local`; sign-in needs [docs/SETUP.md](docs/SETUP.md)).
