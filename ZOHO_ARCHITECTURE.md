# Backup Instructor — Zoho ⇄ Product Integration (Architecture A)

> Decided architecture. Zoho is the **raise + close** touchpoint; the **product owns
> the full lifecycle** (assign, invoice, approvals). Read with `ZOHO_SETUP.md`
> (raise webhook details) and `CLAUDE.md` (product internals).

## Roles
- **Zoho Creator** — universities raise the ticket (native form, fields shown only when
  Category = `Backup Instructor Required`). Zoho is the origin record. When the
  instructor is **allocated**, the Zoho ticket is marked **Closed** (pushed back by us).
- **Product** — receives the raised ticket, runs everything: notify Admin + subject's
  CM → CM assigns instructor (online/offline, Ops decides) → offline invoice flow
  (24h SLA, 3 red-flags, Admin-approved upload, Ops→HOD approval) → close.

## Field sources (Zoho form)
| Field | Source |
| --- | --- |
| University | Auto from raiser's **Staff Profile** (`Staff_Profiles[Official_Mail_ID == zoho.loginuserid].University`); product matcher tolerant of `NIAT - <campus> - <city>` |
| Instructor needing backup | **Zoho lookup → Staff Profiles**, filtered by that campus |
| Subject | Zoho dropdown (managed in Zoho) |
| Reason | Zoho dropdown (manual) |
| Notify Capability Managers | Zoho dropdown (CM list in Zoho) |
| Notes / dates / time / Requested mode | Zoho fields |

## Flow (end to end)
```
Zoho: pick Category = Backup Instructor Required (conditional fields appear)
   └─ submit ─▶ Deluge push workflow ─▶ POST /api/zoho/ticket (x-zoho-secret)
        └─ Product creates ticket (source='zoho', zoho_record_id=<Zoho ID>)
             ├─ email Admin + subject's Capability Manager
             ├─ CM assigns instructor; Ops sets online/offline
             │     └─ ON INSTRUCTOR ALLOCATION ─▶ Product closes the Zoho ticket (API)
             ├─ ONLINE: assign → product ticket closed
             └─ OFFLINE: teach → 24h invoice SLA (miss=red_flag; 3×=upload locked
                        until Admin allows) → Ops approve → HOD approve → closed
```
Key rule: **the Zoho ticket closes when the instructor is allocated** (both modes). The
product ticket continues its own lifecycle (offline invoice/approvals) after that.

## Integration contract
### Raise — Zoho → Product  (BUILT + TESTED)
`POST /api/zoho/ticket` header `x-zoho-secret`. Payload keys: `zoho_id, category,
university, subject, reason, instructor, detailed_description, from_date, to_date,
notify_cms, raised_by_email` (+ `mode` when the field exists). Idempotent by
`zoho_record_id`. Ignores non-`Backup Instructor Required` categories.

### Close — Product → Zoho  (TO BUILD)
When a ticket reaches **instructor allocated** (status `backup_assigned`/`confirmed`),
the product calls the Zoho Creator API to set the origin record's status to Closed.
- API: `PATCH https://www.zohoapis.in/creator/v2.1/data/nxtwave/niat/report/<REPORT>/<zoho_record_id>`
- Body: `{"data": {"Ticket_Status": "<closed value>"}}`
- Auth: OAuth (self-client refresh token), scope `ZohoCreator.report.UPDATE`.
- Needs (to confirm): report link name (from record-print URL:
  `All_Campus_Program_Operations_Tracker`), exact `Ticket_Status` closed picklist value,
  DC = `.in`.

## New env vars (close-back)
`ZOHO_OAUTH_CLIENT_ID`, `ZOHO_OAUTH_CLIENT_SECRET`, `ZOHO_OAUTH_REFRESH_TOKEN`,
`ZOHO_ACCOUNTS_DOMAIN=https://accounts.zoho.in`, `ZOHO_API_DOMAIN=https://www.zohoapis.in`,
`ZOHO_APP_OWNER=nxtwave`, `ZOHO_APP_NAME=niat`,
`ZOHO_REPORT_NAME=All_Campus_Program_Operations_Tracker`,
`ZOHO_STATUS_FIELD=Ticket_Status`, `ZOHO_STATUS_CLOSED_VALUE=<confirm>`.

## Build order
1. ✅ Raise pipeline (webhook + Deluge push) — done & tested (BIT-0021).
2. Zoho form finish: Instructor→Staff-Profiles lookup; add Requested Mode field;
   populate Notify-CM dropdown; confirm Subject/Reason.
3. Close-back: Zoho OAuth self-client → product Zoho-API helper → hook on allocation.
4. End-to-end test: raise in Zoho → assign in product → Zoho ticket auto-Closed.
