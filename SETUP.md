# Setup — Supabase + Google OAuth

Backend integration for the NIAT Backup Instructor Platform. Do these once; then
`npm run dev` and sign in.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it (e.g. `niat-backup-instructor`), pick a region close to India
   (**Mumbai / ap-south-1**), set a strong DB password, create.
3. Wait for it to provision (~2 min).

## 2. Grab the API keys

**Project Settings → API**, copy into `.env.local`:

| `.env.local` key                    | Where in Supabase                         |
| ----------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`          | Project URL                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Project API keys → **anon / public**      |
| `SUPABASE_SERVICE_ROLE_KEY`         | Project API keys → **service_role** (secret) |

> The service_role key is a secret. It's only read server-side and `.env.local`
> is git-ignored — never commit it or expose it to the browser.

## 3. Create the database schema

**SQL Editor → New query**, then run each file's contents in order:

1. Paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
2. Paste all of [`supabase/seed.sql`](supabase/seed.sql) → **Run**.

This creates the tables, row-level security, the new-user trigger, and
pre-authorizes **programopscentral@nxtwave.in** as the first Admin.

_(Alternative: `npx supabase link` + `npx supabase db push` if you use the CLI.)_

## 4. Configure Google as an auth provider

### 4a. Google Cloud — create the OAuth client
1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen**: choose **Internal** (restricts to
   your Google Workspace — this is your first line of the nxtwave-only lock).
   Fill app name + support email, save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: paste the callback URL from Supabase
     (next step) — it looks like
     `https://<your-ref>.supabase.co/auth/v1/callback`
   - Create → copy the **Client ID** and **Client secret**.

### 4b. Supabase — enable the provider
1. **Authentication → Providers → Google** → enable.
2. Paste the **Client ID** and **Client secret**, save.
3. Copy the **Callback URL** shown there back into Google's Authorized redirect
   URIs (step 4a) if you hadn't already.

### 4c. Supabase — URL configuration
**Authentication → URL Configuration**:
- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: add `http://localhost:3000/**`

_(When you deploy to Vercel, add the production URL in both places and in
Google's origins/redirects.)_

## 5. Run it

```bash
npm run dev
```

Open <http://localhost:3000> → you're redirected to **/login** → **Continue with
Google**. Sign in with **programopscentral@nxtwave.in** and you land on the
**Admin** dashboard. Any other `@nxtwave.in` / `@nxtwave.co.in` account signs in
as **pending** until an Admin grants a role.

---

## How access works (so the flow is clear)

- **Domain lock** is enforced three ways: Google "Internal" consent screen, a
  server-side check in the OAuth callback, and login UI copy.
- **First Admin** is bootstrapped by `seed.sql` via an _email pre-authorization_
  (`access_grants`). On first login the trigger applies it and activates the
  profile.
- **Everyone else**: an Admin will (in the next build) grant roles by email. If
  the person hasn't logged in yet, the grant waits in `access_grants` and is
  applied automatically on their first login. If they're already pending, it's
  written straight to `role_assignments`.

## Troubleshooting
- **"Sign-in blocked — not an @nxtwave address"**: you used a personal Google
  account. Use your NxtWave workspace account.
- **Stuck on "Access pending"**: no role assigned yet. Confirm `seed.sql` ran and
  that you signed in with the exact bootstrap email.
- **redirect_uri_mismatch**: the redirect URI in Google Cloud must match the
  Supabase callback URL exactly.
