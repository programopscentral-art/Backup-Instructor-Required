# Zoho Creator → NIAT Backup Instructor (read-only intake)

Zoho is the place universities **raise** tickets. The Zoho form is a shared
"Campus & Program Operations Tracker" with a **Category** field; we ingest **only**
the rows where `Category = "Backup Instructor Required"`. On submit, Zoho pushes the
ticket to our webhook; it appears **instantly** in the app for the raising staff,
Admin, HOD (and notifies the subject's CM). We never write back to Zoho.

- **Webhook URL:** `https://backup-instructor-required.vercel.app/api/zoho/ticket`
- **Options URL:** `https://backup-instructor-required.vercel.app/api/zoho/options`
- **Auth header (both):** `x-zoho-secret: <YOUR_ZOHO_WEBHOOK_SECRET_FROM_ENV>`
- **Method:** webhook `POST` (JSON) · options `GET`

> **Dynamic by design.** Every dropdown is fed live from the product DB. When an
> admin adds a university / subject / instructor / CM in the **product UI**, it
> shows up in Zoho on the next form load — **no Zoho edits, ever.**

---

## The key design point: no University field in Zoho
The Zoho form has **no University field**. The university is derived from **who
raised the ticket** — the logged-in staff member (`zoho.loginuserid`). Our endpoint
resolves their campus from their staff scope in our DB. So the raiser's university
(and their campus's instructor list) is always correct without them picking it.

## Field mapping (Zoho form → JSON we expect)
| Zoho field (image 1)        | JSON key we expect     | Notes |
| --------------------------- | ---------------------- | ----- |
| Category (dropdown)         | `category`             | We only accept `Backup Instructor Required` |
| Subject (dropdown)          | `subject`              | dynamic from DB |
| Reason (dropdown)           | `reason`               | dynamic from DB |
| Instructor needing backup   | `instructor`           | dynamic, by raiser's campus |
| Detailed Description        | `detailed_description` | → ticket notes |
| Backup Required From (date) | `from_date`            | `yyyy-MM-dd` |
| Backup Required To (date)   | `to_date`              | `yyyy-MM-dd` |
| Requested Mode (dropdown)   | `mode`                 | **coming soon** — dynamic from DB |
| Notify Capability Managers  | `notify_cms`           | dynamic CM list; we notify them |
| _(submitter, automatic)_    | `raised_by_email`      | `zoho.loginuserid` → derives university |

---

## Step 1 — Test against the live URL (beta → prod)
Our endpoint is already live on Vercel and pinned to Mumbai. Test from Zoho's
**Development** environment against the same URL — nothing on our side changes when
you later publish the Zoho app to production. Confirm it's reachable: open
`https://backup-instructor-required.vercel.app/api/zoho/ticket` in a browser →
`{"ok":true,"endpoint":"zoho/ticket","ready":true}`.

## Step 2 — Dynamic dropdowns (Deluge, on form load / a custom function each)
Each dropdown calls the options feed and populates itself. Create one function per
dropdown (or a `getUrl`-style workflow). Auth header is the same secret.

```deluge
// Shared header
headers = Map();
headers.put("x-zoho-secret", "<YOUR_ZOHO_WEBHOOK_SECRET_FROM_ENV>");
base = "https://backup-instructor-required.vercel.app/api/zoho/options";

// SUBJECTS  → resp.get("subjects")  (list of strings)
subj = invokeurl [ url: base type: GET headers: headers ];

// REASONS   → resp.get("reasons")
// MODES     → resp.get("modes")   (use when Requested Mode field is added)
// (same call as above; read the matching key)

// INSTRUCTOR needing backup — depends on the raiser's campus (by their email):
insUrl = base + "?type=instructors&email=" + zoho.loginuserid;
ins = invokeurl [ url: insUrl type: GET headers: headers ];
// ins.get("instructors") = list like "Ravi Kumar (EMP123)"

// NOTIFY CAPABILITY MANAGERS — dynamic CM list:
cmUrl = base + "?type=capability_managers";
cms = invokeurl [ url: cmUrl type: GET headers: headers ];
// cms.get("capability_managers") = [{label, value(email)}]; store value(email)
```

> The instructor dropdown uses `email=<raiser>` (not a university name), because the
> form has no University field. Our endpoint maps that email → their campus →
> instructors. `Notify Capability Managers` should store each CM's **email** as the
> value (that's what the webhook expects in `notify_cms`).

## Step 3 — Workflow that pushes to us (Deluge)
Zoho Creator → your ticket form → **Workflows** → **On successful form submission**
→ **Custom function / Deluge**. The `if` guard means only Backup-Instructor rows are
sent (adjust `input.<Field>` to your actual field link-names):

```deluge
if(input.Category == "Backup Instructor Required")
{
	payload = Map();
	payload.put("zoho_id", input.ID.toString());
	payload.put("category", input.Category);
	payload.put("subject", input.Subject);
	payload.put("reason", input.Reason);
	payload.put("instructor", input.Instructor_needing_backup);
	payload.put("detailed_description", input.Detailed_Description);
	payload.put("from_date", input.Backup_Required_From.toString("yyyy-MM-dd"));
	payload.put("to_date", input.Backup_Required_To.toString("yyyy-MM-dd"));
	payload.put("notify_cms", input.Notify_Capability_Managers);
	// payload.put("mode", input.Requested_Mode);   // uncomment when the field exists
	payload.put("raised_by_email", zoho.loginuserid);

	headers = Map();
	headers.put("Content-Type", "application/json");
	headers.put("x-zoho-secret", "<YOUR_ZOHO_WEBHOOK_SECRET_FROM_ENV>");

	response = invokeurl
	[
		url        : "https://backup-instructor-required.vercel.app/api/zoho/ticket"
		type       : POST
		parameters : payload.toString()
		headers    : headers
	];
	info response;
}
```

Notes:
- `zoho.loginuserid` = the submitting staff's email → links them **and** derives the university.
- `input.ID` = the Zoho record id → same record never creates two tickets (idempotent).
- Date fields must be `yyyy-MM-dd`.
- Keep the `mode` line commented until the **Requested Mode** field is added; then uncomment.

## Step 4 — Test
Submit a test row in Zoho with `Category = Backup Instructor Required`, a Subject
that exists in the app, from a staff account whose campus is in the app. Within a
second it appears on the app's **Tickets** page (+ Dashboard); the raiser / Admin /
HOD / selected CMs get notified. `info response;` shows `{"ok":true,"ticket_no":"BIT-####"}`.
A non-backup category returns `{"ok":true,"skipped":...}` and creates nothing.

## What our endpoint does (built + tested)
- Verifies `x-zoho-secret` (401 otherwise).
- **Ignores non-`Backup Instructor Required` categories** (defensive; Zoho also guards).
- Maps Subject → our record; resolves its Capability + CM.
- **Derives the university from the raiser** (staff scope / directory), payload wins if sent.
- Links the raiser's app account by email; inserts the ticket (`source='zoho'`),
  idempotent by `zoho_record_id`.
- Notifies raiser, subject's CM, all Admins/HODs, **and any CMs picked in
  "Notify Capability Managers"** (in-app + email); Realtime shows it instantly.
