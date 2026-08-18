@AGENTS.md

# NIAT Backup Instructor Platform — Full Project Guide (pin-to-pin)

> This file is the single source of truth for continuing this project in any new
> session. It captures the product, architecture, every flow, current state, how
> to run/test/deploy, and next steps. Read it fully before making changes.
> Built with Claude (model: **Opus 4.8**). No secrets live here — they are in
> `.env.local` (git-ignored) and Vercel env vars.

---

## 1. What this is
An internal ops platform for **NIAT (NxtWave Institute of Advanced Technologies)** across 40+ universities. When a university instructor is suddenly absent (or assigned other work), a **backup instructor** must be arranged (online/offline, decided by Program Ops), delivered, and — if offline — expensed within 24h and approved Ops → HOD. Universities **raise tickets in Zoho Creator**; the ticket flows (read-only) into this app instantly and is worked through here.

## 2. Live coordinates
- **Production (Vercel):** https://backup-instructor-required.vercel.app  (Vercel team `Central-Team1`, Hobby plan, functions pinned to **Mumbai `bom1`** via `vercel.json`). Push to `main` → auto-deploys.
- **GitHub:** https://github.com/programopscentral-art/Backup-Instructor-Required (branch `main`)
- **Supabase:** project ref `takdccssaodydjrtrnwc`, region **ap-south-1 (Mumbai)**. Pooler: `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.takdccssaodydjrtrnwc`, db `postgres` (session pooler, SSL).
- **Email:** Google Workspace Gmail SMTP (nodemailer), sender `programopscentral@nxtwave.in`.
- **Bootstrap admin:** `programopscentral@nxtwave.in` (via `supabase/seed.sql` access_grant).

## 3. Tech stack
Next.js **16** (App Router, Turbopack, `src/` dir, TypeScript, Tailwind v4) · Supabase (Postgres + Auth + Realtime + Storage + pg_cron) · framer-motion · lucide-react · nodemailer · `pg` (migration scripts only). Auth: **Supabase Google OAuth**, domain-locked to `@nxtwave.in` / `@nxtwave.co.in` (Google consent = **External + Published**; callback deletes any non-nxtwave account).

## 4. Environment variables (keys only — values in `.env.local` / Vercel)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (must be the Vercel URL in prod), `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=nxtwave.in,nxtwave.co.in`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`, `ZOHO_WEBHOOK_SECRET`, and (local-only, for the migration scripts) `SUPABASE_DB_PASSWORD`.

## 5. Roles & access model
Roles: `admin` (Program Ops, full), `hod` (full + final invoice approval), `capability_manager` + `cma` (own subject vertical), `university_staff` (own campus), `instructor`. **Access = role × scope** (`global` / `university` / `capability`) in `role_assignments`. Admin grants by email via **Access** page; if the person hasn't logged in yet the grant sits in `access_grants` and is auto-applied on first login (trigger `handle_new_user`).
- **university_staff** → sees/edits ONLY their campus's data; **raises tickets** for their campus.
- **instructor** → CANNOT raise tickets (shown an instructive message); it's a Program Ops privilege.
- Onboarded test CMs (synthesized emails): `riya.rai@nxtwave.in` (English), `voppangi.saiprasanna@nxtwave.in` (Quant & LR), `meka.srisatyaprudhvicharan@nxtwave.in` (Backend), `preethi.vangaveti@nxtwave.in` (Frontend), `sigatapu.saisankar@nxtwave.in` (DSA). **Real CM emails still TODO.**

## 6. Database (Postgres, all with RLS)
Tables: `profiles`, `role_assignments`, `access_grants`, `universities`, `capabilities` (has `manager_user_id`,`manager_name`), `subjects` (has `normalized_name`,`capability_id`), `university_staff`, `instructors`, `backup_instructor_pool`, `tickets`, `ticket_events`, `invoices`, `invoice_files`, `notifications`, `audit_log` (access history), `activity_log` (directory CRUD, trigger-written), `ticket_reasons` (dynamic), `subject_sessions`.
Key RLS/helpers (SECURITY DEFINER): `is_admin_or_hod()`, `has_role(role)`, `has_scope(role,kind,target)`, `can_see_university(univ_id)`, `can_see_ticket(tid)`, `mark_overdue_invoices()` (pg_cron every 15m), `log_directory_activity()` (trigger on university_staff/instructors/subject_sessions → activity_log), `list_capability_managers()` (safe CM directory for staff), `handle_new_user()`, `set_ticket_no()` (BIT-#### via `ticket_seq`).
Storage: private bucket **`invoices`** (charge slips; served via signed URLs). Realtime enabled on all app tables. **Seeded data:** 41 universities, 166 staff, 152 instructors, 43 subjects, 5 capabilities, 13 backup pool.

## 7. Core flows (end to end)
**Ticket lifecycle** (`tickets.status`): `raised → backup_assigned → confirmed → session_done →` (offline) `invoice_pending → ops_approved → hod_approved → closed` (+ `cancelled`). Online path: `session_done → closed`. Every transition writes `ticket_events` (who/when/what) and can notify.
- Raise (staff/admin) → routes to Ops + subject's CM (via subject→capability).
- **Missing-CM edge case:** on a raised ticket whose subject has no capability, the action panel shows `CapabilitySetup` — admin assigns/creates a capability+manager (persists to subject), then `AssignForm` shows **+ Add to pool** to add backups, then assign.
- CM/admin assigns backup + Ops picks online/offline → admin confirms & dispatches (notifies raiser) → session → offline: `InvoicePanel` (NxtClaim link mandatory + charge-slip upload to Storage), **24h SLA** (`invoice_due_at`; `mark_overdue_invoices` cron flags `red_flag`) → Ops approve → HOD approve → close.
**Directory CRUD** uses the reusable realtime `DirectoryTable` (search + column sort + auto FK/select filter dropdowns + inline `+Add`). Staff can CRUD their campus's staff+instructors (auto-logged to `activity_log`).
**Logs** (`/dashboard/logs`): merged University Activity (ticket_events + activity_log, RLS-scoped so staff see only their campus) + admin-only Access history (audit_log).
**Notifications** (`src/lib/notify.ts`): in-app (`notifications` table + realtime bell) + Gmail email; fired on assign/confirm, Zoho intake, etc.

## 8. Zoho Creator integration (READ-ONLY intake) — our side DONE, Zoho side PENDING
Universities raise tickets in **Zoho**, which pushes to us; we never write to Zoho.
- **`POST /api/zoho/ticket`** — webhook. Auth: header `x-zoho-secret` == `ZOHO_WEBHOOK_SECRET`. Maps university/subject by name, resolves capability+CM+raiser-by-email, inserts ticket (`source='zoho'`, idempotent by unique `zoho_record_id`), notifies raiser+CM+admins/HOD, realtime shows instantly. `GET` = health check.
- **`GET /api/zoho/options`** — read-only feed for **dynamic Zoho dropdowns** (so new universities/subjects/instructors auto-appear in Zoho). Returns `{universities,subjects,reasons,modes}`; `?type=instructors&university=<name|code>` → that campus's instructors. Auth: same secret header.
- Middleware (`src/lib/supabase/middleware.ts`) treats `/api` as public (routes self-auth via secret).
- **Zoho-side TODO (user):** add the Deluge workflow (On successful form submission → POST to `/api/zoho/ticket`) and dynamic-dropdown functions (fetch `/api/zoho/options`) — full scripts + field mapping in **`ZOHO_SETUP.md`**. Fields JSON keys: `zoho_id, university, subject, reason, instructor, notes, from_date, to_date, time_from, time_to, mode, raised_by_email`.

## 9. Key conventions / gotchas (IMPORTANT)
- **Server data access MUST use `createAuthedClient()`** (`src/lib/supabase/server.ts`) — it calls `getUser()` to load the session so RLS queries aren't anonymous. A plain `createClient()` + query returns 0 rows (anon). This is `cache()`-wrapped so one request = one validation.
- `getSessionContext()` (`src/lib/auth/session.ts`) is `cache()`-wrapped too (dedupe layout+page).
- Dashboard layout is `force-dynamic` (live data). Perf: don't reintroduce per-call `getUser()`; reuse the cached client.
- **Server actions that redirect break `useActionState`** in Next 16/Turbopack — return an id and navigate client-side (see `createTicket` → returns `ticketId`, form does `router.push`).
- Role theming: `src/lib/theme/role-theme.ts` → `AppShell` sets `--accent*` CSS vars per role; the whole UI recolors. Nav items have `allow?: AppRole[]` (empty = admin-only).
- **Migrations:** `supabase/migrations/0001..0013`. Apply with `node --env-file=.env.local scripts/apply-db.mjs` (idempotent; connects via Mumbai session pooler). 0011/0012/0013 were also applied directly (files 0008/0010 had been corrupted by the user's voice-dictation tool, now repaired).
- ⚠️ **User's machine runs a voice-dictation / AI-typing tool that injects random text into open files** (corrupted 0008/0010, .env.local, ZOHO_SETUP.md at times). If files show garbled sentences, that's the cause — advise disabling it; repair by rewriting the file.
- User's work laptop **blocks downloaded binaries** (ngrok/cloudflared) via Application Control — that's why we used Vercel (not tunnels) for the public URL.

## 10. Scripts (`scripts/`, run with `node --env-file=.env.local <script>`)
`apply-db.mjs` (run all migrations + seed), `seed-data.mjs` (reference data), `import-sheets.mjs` (staff+instructors from parsed sheet JSON), `e2e-test.mjs` (full lifecycle assertions, 14 checks), `onboard-cms.mjs` (CM accounts + RLS scoping proof), `test-email.mjs` (verify Gmail SMTP). Build/dev: `npm run dev`, `npm run build`.

## 11. Status & next steps
DONE: auth+roles, 7 directories (realtime CRUD, university-scoped), full ticket lifecycle, invoices+Storage+24h pg_cron, logs/audit, email+in-app notifications, role-themed UI, dynamic Zoho dropdown feed + webhook (our side), full sheet data import, CM onboarding, production deploy (Mumbai), perf pass. E2E 14/14 passing.
TODO / next: (1) finish **Zoho side** (workflow + dropdown functions per `ZOHO_SETUP.md`), test a real submit; (2) grant **real CM emails**; (3) optional features discussed — **Analytics dashboard, Escalations/reminders (extend cron), Smart backup suggestions, Instructor self-service (own assignments + submit own invoices), ticket comments, WhatsApp/Slack alerts, command palette, dark mode**; (4) perf: optional single `dashboard_counts()` RPC; (5) remind user to disable the dictation tool.
