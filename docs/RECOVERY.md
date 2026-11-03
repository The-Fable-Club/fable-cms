# Recovery: getting back in when something is lost

Last checked: 2026-11-03. Read this **before** you need it, and keep at least two people able to do every step below.

The short version:
- **The live site keeps working through almost anything.** It is static and only changes on Publish or a push. A broken CMS, a lost key or deleted rows don't take it down. Don't press Publish while content is missing.
- **Everything can be rebuilt from three things:** a Supabase dashboard login, a GitHub org owner and a Vercel team login. Guard those three accounts; everything else can be re-created from them.
- **Take backups** with `npm run backup` (section 4). Don't count on restoring from Supabase's own backups on the free plan.

Never put a key, password or backup file in git, an issue, chat or a screenshot. This repo is public.

---

## 1. Accounts and where every key lives

Fill in the "login" column once, and keep it up to date when people change. The values themselves live only in the places listed, never here.

| Service | What it runs | Login (whose account) | Keep at least 2 people in it |
|---|---|---|---|
| **GitHub** org `The-Fable-Club` | Both repos, the OAuth app for CMS sign-in | Org owners (see [ACCESS.md](ACCESS.md)) | Org owners |
| **Vercel** team "The Fable Club" (Hobby) | `fable-site` (www.thefableclub.com), `fable-cms` (cms.thefableclub.com), the DNS for thefableclub.com |me and sharann | Team members |
| **Supabase** org "The Fable Club", project `cvfwkrhldhtkydisduey` | Database, GitHub sign-in, storage | me and sharann | Org members (Organization → Team) |
| **Domain registrar** for thefableclub.com | Renewal of the domain (nameservers point at Vercel) | sharann | n/a, but note the renewal date: no idea|
| **Zoho Mail** | contact@thefableclub.com inbox (MX records) | sharann and me | Zoho admins |
| **Resend** | Sending the automatic emails (domain verified on 2026-11-03) | me | Team members |
| **ImageKit** (`ik.imagekit.io/thefableclub`) | Photos and clips (being built, fable-cms#1) |me| Team members |

| Secret | Lives in | Used for | If lost or leaked |
|---|---|---|---|
| Supabase **secret key** (`SUPABASE_SERVICE_ROLE_KEY`) | CMS Vercel env, CMS `.env.local` | Maintenance scripts, live tests | 3.4 |
| Supabase **publishable key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Both Vercel projects, both `.env.local` | Public, by design | 3.4 (both projects) |
| Database password (`DATABASE_URL`) | CMS `.env.local` only | `scripts/db.mjs`, backups, role tests | 3.3 |
| Deploy hook (`VERCEL_DEPLOY_HOOK_URL`) | CMS Vercel env, CMS `.env.local` | Publish → rebuild the site | 3.5 |
| GitHub OAuth app client secret | Supabase dashboard only | CMS sign-in | 3.2 |
| `RESEND_API_KEY` (+ `MAIL_FROM`) | CMS Vercel env | Application alerts, question answers | 3.6 |
| `APPLICATION_HOOK_SECRET` | CMS Vercel env **and** Supabase vault (`application_hook_secret`) | The database proving to the CMS that an alert is real | 3.7 |
| `IMAGEKIT_PRIVATE_KEY` (+ public key, URL endpoint) | CMS Vercel env, CMS `.env.local` | Signing uploads | 3.8 |

After changing any CMS Vercel variable: **redeploy the CMS** (Vercel → fable-cms → Deployments → ⋯ → Redeploy). Variables starting with `NEXT_PUBLIC_` are baked into a build, so the site needs a redeploy too.

---

## 2. Locked out of the CMS

### 2.1 Your CMS access is gone (someone removed you, or the People list was emptied)
CMS access is just a row in the `admins` table. Put it back from the **Supabase dashboard → SQL editor** (or from a computer with `DATABASE_URL`: `node scripts/db.mjs --sql "..."`):

```sql
insert into admins (github_username, role, added_by)
values ('your-github-username', 'owner', 'recovery')       -- lower case!
on conflict (github_username) do update set role = 'owner';
```

Then sign out of the CMS and sign in again. Check with `select * from admins;`.

- The username is your **GitHub login in lower case** (e.g. `haise-727`). The CMS reads it from the identity GitHub gave Supabase, so a display name won't match.
- Since migration 0011, the database refuses any statement that would leave **no owner** at all, and refuses `truncate admins`. Since 0012 it also refuses removing or demoting **haise-727** (the system's owner). If ownership ever passes on, a new migration changes that name. So "everyone deleted" can only happen if someone deliberately switched that guard off. To restore the whole list from a backup: `npm run restore -- --file backups/<file>.json --table admins`.
- The People screen also refuses to remove or demote the last owner, and nobody can change their own level.

### 2.2 GitHub sign-in itself fails ("provider is not enabled", a redirect error, a loop back to /login)
1. Supabase → **Authentication → Sign In / Providers → GitHub** must be on, with a Client ID and Secret.
2. If the OAuth app was deleted or its secret lost: GitHub → The-Fable-Club → Settings → Developer settings → OAuth Apps → **Fable CMS** (or create it again, as in [SETUP.md](SETUP.md) step 1). Generate a new client secret and paste both values into Supabase. The callback URL is `https://cvfwkrhldhtkydisduey.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → URL Configuration** must list `https://cms.thefableclub.com/auth/callback` (plus the localhost ones for local work).

### 2.3 Nobody can log in to the Supabase dashboard
That's the one door that has to be opened from outside:
1. Reset the password of the account that owns the Supabase org (use "Forgot password", which goes to that account's email). If the account used "Continue with GitHub", recover the GitHub account first.
2. If the owner's account can't be recovered at all, write to Supabase support **from the email address on the owning account**, with the project ref `cvfwkrhldhtkydisduey`.
3. Prevention: keep two or more people as Supabase org members.

### 2.4 Nobody can log in to Vercel or GitHub
- Vercel: recover the login, or have another team member log in. The site keeps serving meanwhile. Without Vercel you can't rebuild or change DNS.
- GitHub: another org owner can re-invite people and fix access. Org owners are listed in [ACCESS.md](ACCESS.md). If all owners are gone, GitHub support needs proof of ownership, so keep several owners.

---

## 3. Keys and passwords: replacing one

Do the steps, redeploy, then test (section 6).

### 3.1 General rule
1. Make the new value in the service that issues it.
2. Put it everywhere the table in section 1 lists, with the **same name**.
3. Revoke the old value (if it leaked, do this first).
4. Redeploy the CMS (and the site, if a `NEXT_PUBLIC_` value changed).

### 3.2 GitHub OAuth client secret
See 2.2, step 2. It lives only in Supabase. No redeploy needed.

### 3.3 Database password (`DATABASE_URL`)
Supabase → **Project Settings → Database → Reset database password**. Build the new string from **Connect → Session pooler** and put it in `.env.local` as `DATABASE_URL`.
- Special characters in the password must be percent-encoded in the URL (`@` → `%40`, `#` → `%23`, `/` → `%2F`).
- Nothing on Vercel uses it. The `POSTGRES_*` variables the Supabase integration added to the CMS project are unused leftovers; they go stale after a reset, and it's best to delete them.

### 3.4 Supabase keys
Supabase → **Project Settings → API Keys**.
- **Secret key leaked:** create a new secret key, put it in the CMS Vercel env and `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`, redeploy the CMS, then **delete the old key**.
- **Publishable key:** create a new one, update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in **both** Vercel projects and both `.env.local` files, redeploy **both**, then delete the old one. Until the site is rebuilt, its forms use the old key.

### 3.5 Deploy hook
Vercel → **fable-site → Settings → Git → Deploy Hooks**: delete the old hook, create `cms-publish` on branch `main`, and put the URL in the CMS env as `VERCEL_DEPLOY_HOOK_URL` (Vercel and `.env.local`). Redeploy the CMS. Anyone with the URL can only trigger rebuilds, but replace it if it leaks.

### 3.6 Resend
Resend → **API Keys**: create a key with **Sending access** for thefableclub.com, set `RESEND_API_KEY` in the CMS Vercel env, redeploy, delete the old key. If the domain shows unverified, re-add the DNS records Resend lists (Vercel → Domains → thefableclub.com → DNS). **Never touch the Zoho MX records or the `v=spf1 include:zoho.in ~all` record**: they carry the inbox.

### 3.7 Application-alert secret
It has to match in two places. Make a new random value, then:
```sql
-- Supabase SQL editor
select vault.update_secret((select id from vault.secrets where name = 'application_hook_secret'), '<new value>');
```
Set the same value as `APPLICATION_HOOK_SECRET` in the CMS Vercel env (mark it Sensitive) and redeploy. Test as in section 6. If they don't match, alerts stop (applications are still saved): `select status_code, content from net._http_response order by created desc limit 5;` shows `401`.

### 3.8 ImageKit
ImageKit dashboard → **Developer options**: replace the private key, update `IMAGEKIT_PRIVATE_KEY` in the CMS Vercel env and `.env.local`, redeploy. The public key and URL endpoint are not secret.

---

## 4. Backups and restoring data

### 4.1 Take a backup
```bash
cd fable-cms
npm run backup          # every public table -> backups/<date>.json (git-ignored)
```
Do it **before any migration**, before big cleanups, and about weekly. Copy the file somewhere private (the club drive). It contains applicants' personal details, so never put it in git or chat.

### 4.2 Restore a table
```bash
npm run restore -- --file backups/<date>.json --table admins --dry-run   # count only, nothing changes
npm run restore -- --file backups/<date>.json --table admins
```
It only **adds back rows that are missing** (matched on the primary key), never deletes or overwrites, and keeps the original ids. Running it twice is safe. Restore `admins` and `events` before tables that refer to events (`registrations`, `event_questions`).

### 4.3 Events or people were deleted or wrongly edited
1. **Don't Publish.** The live site still shows the last good release.
2. Restore the rows from the newest backup (4.2): `events`, `members`.
3. No backup? Every Publish saved a full copy of what was public: `select id, published_at, note from releases order by id desc;` and `select snapshot from releases where id = <n>;`. Re-enter from it by hand (drafts were never in it).
4. Publish once the CMS looks right again.

### 4.4 The live site shows something wrong
- **CMS → Releases → Roll back** (owners) republishes an older release as a new one.
- Or **Vercel → fable-site → Deployments** → pick the last good one → **Promote to Production** (instant).

---

## 5. Other things that can go wrong

| Symptom | Cause and fix |
|---|---|
| Publish worked, but the site didn't change | Vercel → fable-site → Deployments: the build failed. A bad release fails the build on purpose and the old site keeps serving. The log names the event and field; fix it in the CMS and publish again. If the hook failed, an owner presses **Retry rebuild** on Releases. |
| Forms on the site fail, CMS shows errors, builds fail fetching the release | The free Supabase project **pauses after about a week without activity**. Supabase dashboard → the project → **Restore/Resume**. |
| No email for new applications | `select status_code, content, error_msg from net._http_response order by created desc limit 5;` `401` = secret mismatch (3.7); `502` = Resend refused (check the key and domain, 3.6); nothing at all = the vault secret is missing or the trigger is off (`select tgname from pg_trigger where tgname = 't_notify_new_application';`). |
| "Wait a minute before publishing again" | At most one publish per minute (wait 60 s). A database lock (migration 0009) also stops two people publishing at once. |
| A migration went wrong | Take a backup first, always (4.1). Migrations are additive where possible; a fix is a **new** numbered migration, never an edit to an applied one. |
| Someone leaves the club | Remove them in the CMS People screen, the GitHub org, Vercel and Supabase. Replace any secret they had in a `.env.local` (section 3). |

---

## 6. After any fix: check it works
1. `https://cms.thefableclub.com/api/health` → `{"ok":true}`.
2. Sign in to the CMS; your level badge is right.
3. Press Publish (or Retry rebuild) and watch Vercel → fable-site go Ready.
4. With a terminal: `npm run test:live` in this repo runs the live checks against the real project. Test rows start with `zz-` and clean up after themselves; the publish drill really rebuilds the site twice.
