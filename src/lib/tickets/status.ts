export type TicketStatus =
  | "raised"
  | "backup_assigned"
  | "confirmed"
  | "session_done"
  | "invoice_pending"
  | "ops_approved"
  | "hod_approved"
  | "closed"
  | "cancelled";

export type TicketMode = "undecided" | "online" | "offline";

export const STATUS_META: Record<TicketStatus, { label: string; pill: string }> = {
  raised: { label: "Raised", pill: "pill-info" },
  backup_assigned: { label: "Backup Assigned", pill: "pill-violet" },
  confirmed: { label: "Ops Confirmed", pill: "pill-accent" },
  session_done: { label: "Session Done", pill: "pill-amber" },
  invoice_pending: { label: "Invoice Pending", pill: "pill-warn" },
  ops_approved: { label: "Ops Approved", pill: "pill-accent" },
  hod_approved: { label: "HOD Approved", pill: "pill-good" },
  closed: { label: "Closed", pill: "pill-good" },
  cancelled: { label: "Cancelled", pill: "pill-crit" },
};

/** The linear happy-path stepper (cancelled is off-path). */
export const STEPPER: TicketStatus[] = [
  "raised",
  "backup_assigned",
  "confirmed",
  "session_done",
  "invoice_pending",
  "ops_approved",
  "hod_approved",
  "closed",
];

export const MODE_LABEL: Record<TicketMode, string> = {
  undecided: "Undecided",
  online: "Online",
  offline: "Offline",
};
