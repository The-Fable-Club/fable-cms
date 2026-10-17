# Setup: turning on GitHub sign-in

The app and the database are ready. The last missing piece is the **GitHub provider in Supabase**: right now Supabase answers `Unsupported provider: provider is not enabled`. Four steps, about five minutes.

## 1. Create the GitHub OAuth app
GitHub → your organisation **The-Fable-Club** → **Settings → Developer settings → OAuth Apps → New OAuth App**
(creating it under the org rather than a personal account means it doesn't depend on one person).

| Field | Value |
|---|---|
| Application name | `Fable CMS` |
| Homepage URL | `http://localhost:3200` (change to the real CMS address later) |
| Authorization callback URL | `https://cvfwkrhldhtkydisduey.supabase.co/auth/v1/callback` |

Register it, copy the **Client ID**, then **Generate a new client secret** and copy that too.
The callback goes to **Supabase**, not to this app.

## 2. Enable the provider in Supabase
**Authentication → Sign In / Providers → GitHub** → switch on → paste the Client ID and Client Secret → Save.
(These two values live only in Supabase's dashboard, not in `.env.local`.)

## 3. Allow the app's addresses
**Authentication → URL Configuration**
- Site URL: `http://localhost:3200`
- Redirect URLs: add `http://localhost:3200/auth/callback`
  (later also `https://cms.thefableclub.com/auth/callback`)

## 4. Close the other doors
**Authentication → Sign In / Providers → Email** → switch **off**. Only GitHub should be able to sign in.
Leave "Allow new users to sign up" on; the first GitHub login needs it, and being *signed in* gives no access anyway: only accounts in the `admins` table pass `is_admin()`.

## Try it
```powershell
cd D:\Coding\fable-cms
npm run dev -- -p 3200
```
Open http://localhost:3200 → **Sign in with GitHub**. As `Haise-727` you should land on the dashboard with an `OWNER` badge. Any other GitHub account is signed straight back out with "isn't on the admin list".

## Adding another admin later
Until the Admins screen exists, add them in the Supabase SQL editor (GitHub username in lower case):
```sql
insert into admins (github_username, role, added_by) values ('their-username', 'editor', 'haise-727');
```
