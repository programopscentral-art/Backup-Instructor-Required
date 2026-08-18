# Zoho Creator → NIAT Backup Instructor (read-only intake)

Zoho is the place universities **raise** tickets. On submit, Zoho pushes the
ticket to our webhook; it appears **instantly** in the app for the raising staff,
Admin, HOD (and notifies the subject's CM). We never write back to Zoho.

- **Webhook URL:** `https://<YOUR-PUBLIC-URL>/api/zoho/ticket`
- **Auth header:** `x-zoho-secret: <YOUR_ZOHO_WEBHOOK_SECRET_FROM_ENV>`
- **Method:** `POST` · **Body:** JSON

---

## Step 1 — Make the app reachable by Zoho (public URL)
Zoho's cloud can't reach `localhost`. Choose one:

- **Quick test (local):** run a tunnel →
  ```bash
  npx ngrok http 3000
  ```
  Use the `https://xxxx.ngrok-free.app` URL it prints.
- **Production (recommended):** deploy to **Vercel** → use `https://<app>.vercel.app`.
  (A stable URL means you set the Zoho workflow once.)

Confirm it's reachable — open `https://<YOUR-PUBLIC-URL>/api/zoho/ticket` in a
browser; it should return `{"ok":true,"endpoint":"zoho/ticket","ready":true}`.

## Step 2 — Ticket form fields in Zoho
Add these fields to your Zoho ticket form (names can differ — you'll map them in
the script). These match the app's Raise-Ticket form:

| App field                | Zoho field (suggested)     | JSON key we expect |
| ------------------------ | -------------------------- | ------------------ |
| University *             | University (dropdown)      | `university`       |
| Subject *                | Subject (dropdown)         | `subject`          |
| Reason *                 | Reason (dropdown)          | `reason`           |
| Instructor needing backup* | Instructor Needing Backup | `instructor`      |
| Additional notes         | Additional Notes           | `notes`            |
| Backup needed from       | Backup Needed From (date)  | `from_date`        |
| Backup needed to         | Backup Needed To (date)    | `to_date`          |
| Time from                | Time From                  | `time_from`        |
| Time to                  | Time To                    | `time_to`          |
| Requested mode           | Requested Mode (dropdown)  | `mode`             |
| _(submitter, automatic)_ | —                          | `raised_by_email`  |

> University & Subject are matched to our DB by **name** (case-insensitive). Use
> the same spellings as in the app's Universities / Subjects directories for a
> clean match. Unmatched ones still create the ticket — an admin resolves it.

## Step 3 — Workflow that pushes to us (Deluge)
In Zoho Creator → your ticket form → **Workflows** → **On successful form
submission** → **Custom function / Deluge**, paste (adjust the `input.<Field>`
names to your actual field link-names):

```deluge
payload = Map();
payload.put("zoho_id", input.ID.toString());
payload.put("university", input.University);
payload.put("subject", input.Subject);
payload.put("reason", input.Reason);
payload.put("instructor", input.Instructor_Needing_Backup);
payload.put("notes", input.Additional_Notes);
payload.put("from_date", input.Backup_Needed_From.toString("yyyy-MM-dd"));
payload.put("to_date", input.Backup_Needed_To.toString("yyyy-MM-dd"));
payload.put("time_from", input.Time_From);
payload.put("time_to", input.Time_To);
payload.put("mode", input.Requested_Mode);
payload.put("raised_by_email", zoho.loginuserid);

headers = Map();
headers.put("Content-Type", "application/json");
headers.put("x-zoho-secret", "<YOUR_ZOHO_WEBHOOK_SECRET_FROM_ENV>");

response = invokeurl
[
    url    : "https://<YOUR-PUBLIC-URL>/api/zoho/ticket"
    type   : POST
    parameters : payload.toString()
    headers : headers
];
info response;
```

Notes:
- `zoho.loginuserid` = the email of the staff submitting (used to link them + scope who sees it).
- `input.ID` = the Zoho record id (used so the same record never creates two tickets).
- Date fields must be sent as `yyyy-MM-dd`.

## Step 4 — Test
Submit a test ticket in Zoho with a University & Subject that exist in the app.
Within a second it should appear on the app's **Tickets** page (and Dashboard),
and the raising staff / Admin / HOD get a notification. `info response;` in the
Deluge log shows our reply: `{"ok":true,"ticket_no":"BIT-####"}`.

## What our endpoint does (already built + tested)
- Verifies the `x-zoho-secret` (rejects anything else with 401).
- Maps University/Subject → our records; resolves the subject's Capability + CM.
- Links the raiser's app account by email (if they have one).
- Inserts the ticket (`source = 'zoho'`), idempotent by `zoho_record_id`.
- Notifies the raiser, the subject's Capability Manager, and all Admins/HODs
  (in-app + email), and Realtime shows it instantly in the UI.
