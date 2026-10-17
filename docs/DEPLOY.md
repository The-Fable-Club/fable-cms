# Deploying to Vercel (public site + CMS)

State on 2026-10-17: `thefableclub.com` already uses Vercel's nameservers (nothing to edit at a registrar). `fable-site` is on GitHub. `fable-cms` on GitHub is behind your local copy until you push.

Two Vercel projects, in the **The Fable Club** (Hobby) scope:

| Project | Repo | Domain |
|---|---|---|
| Public site | `The-Fable-Club/fable-site` (public) | `thefableclub.com` (+ `www` redirecting to it) |
| CMS | `The-Fable-Club/fable-cms` (private) | `cms.thefableclub.com` |

## A. Push the CMS repo
```powershell
cd D:\Coding\fable-cms
git status        # clean
git push origin main
```

## B. Public site
1. Vercel → **Import Project** → **Import Git Repository**. If `The-Fable-Club` isn't listed: *Adjust GitHub App Permissions* → install the Vercel app on the org (an org owner approves) → select `fable-site` (and `fable-cms`).
2. Pick `fable-site`. Framework is detected as Next.js. No environment variables are needed yet. **Deploy** (about 2 minutes).
3. Project → **Settings → Domains** → add `thefableclub.com`, then `www.thefableclub.com` set to redirect to the apex. Verification is automatic.
4. Project → **Settings → Git → Deploy Hooks** → name `cms-publish`, branch `main` → **Create Hook** → copy the URL.
   Paste it into `D:\Coding\fable-cms\.env.local` as `VERCEL_DEPLOY_HOOK_URL=` (a secret: not in chat, not in git).

## C. CMS
1. Import `fable-cms` the same way.
   *Vercel Hobby may refuse a private repo owned by an organisation.* If it does, either:
   - deploy from this folder with the CLI (no Git link needed):
     ```powershell
     cd D:\Coding\fable-cms
     vercel login
     vercel link        # scope: The Fable Club -> create project "fable-cms"
     vercel deploy --prod
     ```
   - or move the repo to your personal GitHub account (Settings → Transfer) and import it from there.
2. **Settings → Environment Variables** (Production; tick *Sensitive* on the two secrets):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | same as `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | secret key (Sensitive) |
   | `VERCEL_DEPLOY_HOOK_URL` | the hook from B4 (Sensitive) |
   | `ADMIN_GITHUB_USERNAMES` | `Haise-727` |
   | `GITHUB_REPO` | `The-Fable-Club/fable-site` |

   Redeploy after adding them.
3. **Settings → Domains** → add `cms.thefableclub.com`.

## D. Tell Supabase and GitHub the new address
- Supabase → **Authentication → URL Configuration**
  - Site URL: `https://cms.thefableclub.com`
  - Redirect URLs: add `https://cms.thefableclub.com/auth/callback` and the project's `https://<project>.vercel.app/auth/callback`. Keep the localhost entries.
- GitHub OAuth app → **Homepage URL** → `https://cms.thefableclub.com` (cosmetic). The callback URL stays the Supabase one; no Vercel address ever goes there.

## E. Check
- `https://cms.thefableclub.com/api/health` returns `{"ok":true}`.
- Sign in at `https://cms.thefableclub.com`; you land on the dashboard as owner.
- `https://thefableclub.com` shows the site.

## Notes from the first real deploy (2026-10-17)
- Vercel Hobby refuses **private organisation repos**; the CMS repo was made public (nothing secret is in it, checked across its full history).
- Old CLI versions can't log in any more: `npm install -g vercel@latest`.
- `vercel link` also **writes a short-lived `VERCEL_OIDC_TOKEN` line into `.env.local`**; it is not needed by the CMS and can be deleted from the file.
- A stale `.vercel/` folder can point at a deleted project; delete it and run `vercel link --yes --project fable-cms --scope the-fable-club`.
- `x-vercel-error: DEPLOYMENT_NOT_FOUND` on a domain means the domain is attached but nothing has been deployed yet.
- **NEXT_PUBLIC_ values are baked in at build time**: after adding or changing them, redeploy.
- The Supabase integration in Vercel adds its own variables (`POSTGRES_*`, `SUPABASE_JWT_SECRET`, `SUPABASE_SECRET_KEY`, ...). The CMS does not read them; remove the unneeded ones from the project to keep database credentials out of places that don't need them.

