/**
 * Microsoft Teams notifications — one channel, one-way. Builds an Adaptive Card
 * per ticket_event and posts it to the Power Automate Workflow URL. Server-only;
 * best-effort (never throws into the caller).
 */

export interface TeamsEvent {
  ticketNo: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  actorName: string | null;
  university: string | null;
  subject: string | null;
  capabilityManager: string | null;
  backup: string | null;
  mode: string | null;
  absentInstructor: string | null;
  amount: number | null;
  ticketUrl: string;
}

export interface ReminderDetails {
  ticketNo: string;
  university: string | null;
  subject: string | null;
  capabilityManager: string | null;
  absentInstructor: string | null;
  backup: string | null;
  mode: string | null;
  absentFrom: string | null;
  absentTo: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  dueAt: string | null;
  ticketUrl: string;
}

function fmtDeadline(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

type CardColor = "Default" | "Accent" | "Good" | "Warning" | "Attention";

/** Map an event to a headline (emoji + title + colour). */
function classify(e: TeamsEvent): { emoji: string; title: string; color: CardColor } {
  const note = (e.note || "").toLowerCase();
  const to = e.toStatus;
  const same = e.fromStatus === e.toStatus;

  switch (to) {
    case "raised":
      return { emoji: "🆕", title: "New backup request", color: "Accent" };
    case "backup_assigned":
      return { emoji: "👤", title: "Backup assigned", color: "Accent" };
    case "confirmed":
      return { emoji: "✅", title: "Confirmed & dispatched", color: "Good" };
    case "session_done":
      return { emoji: "🎓", title: "Session delivered", color: "Good" };
    case "ops_approved":
      return { emoji: "🟢", title: "Ops approved the claim", color: "Good" };
    case "hod_approved":
      return { emoji: "🏁", title: "HOD final approval", color: "Good" };
    case "closed":
      return { emoji: "✔️", title: "Ticket closed", color: "Default" };
    case "cancelled":
      return { emoji: "❌", title: "Ticket cancelled", color: "Warning" };
    case "invoice_pending":
      if (note.includes("red flag")) return { emoji: "🔴", title: "Red flag — invoice overdue", color: "Attention" };
      if (note.includes("returned")) return { emoji: "↩️", title: "Invoice returned for fix", color: "Warning" };
      if (note.includes("invoice submitted")) return { emoji: "📄", title: "Invoice filed", color: "Warning" };
      if (!same) return { emoji: "🕒", title: "Awaiting invoice (24h SLA)", color: "Warning" };
      return { emoji: "ℹ️", title: "Invoice update", color: "Default" };
    default:
      return { emoji: "ℹ️", title: "Ticket update", color: "Default" };
  }
}

const MODE_LABEL: Record<string, string> = { online: "Online", offline: "Offline", undecided: "Not decided yet" };

/** Build the Teams message envelope (Adaptive Card inside an attachment). */
export function buildTeamsCard(e: TeamsEvent): unknown {
  const { emoji, title, color } = classify(e);
  const isInvoice = ["invoice_pending", "ops_approved", "hod_approved", "closed"].includes(e.toStatus);

  const facts: { title: string; value: string }[] = [];
  if (e.university) facts.push({ title: "University", value: e.university });
  if (e.subject) facts.push({ title: "Subject", value: e.subject });
  if (e.capabilityManager) facts.push({ title: "Capability Manager", value: e.capabilityManager });
  if (e.absentInstructor && e.toStatus === "raised") facts.push({ title: "Absent", value: e.absentInstructor });
  if (e.backup) facts.push({ title: "Backup", value: e.backup });
  if (e.mode && e.mode !== "undecided") facts.push({ title: "Mode", value: MODE_LABEL[e.mode] ?? e.mode });
  if (isInvoice && e.amount != null) facts.push({ title: "Amount", value: `₹ ${e.amount.toLocaleString("en-IN")}` });
  if (e.actorName) facts.push({ title: "By", value: e.actorName });

  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              { type: "TextBlock", text: `${emoji} ${title}`, weight: "Bolder", size: "Medium", color, wrap: true },
              { type: "TextBlock", text: `Backup OS · ${e.ticketNo}`, isSubtle: true, spacing: "None", size: "Small" },
            ],
          },
        ],
      },
      { type: "FactSet", facts },
      ...(e.note ? [{ type: "TextBlock", text: e.note, wrap: true, isSubtle: true, size: "Small", spacing: "Small" }] : []),
      {
        type: "ActionSet",
        actions: [{ type: "Action.OpenUrl", title: "Open in Backup OS →", url: e.ticketUrl }],
      },
    ],
  };

  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }],
  };
}

/** Detailed "upload your invoice" reminder card (fired every 5h until filed). */
export function buildReminderCard(d: ReminderDetails): unknown {
  const facts: { title: string; value: string }[] = [];
  if (d.university) facts.push({ title: "University", value: d.university });
  if (d.subject) facts.push({ title: "Subject", value: d.subject });
  if (d.capabilityManager) facts.push({ title: "Capability Manager", value: d.capabilityManager });
  if (d.absentInstructor) facts.push({ title: "Absent instructor", value: d.absentInstructor });
  if (d.backup) facts.push({ title: "Backup (you)", value: d.backup });
  if (d.mode && d.mode !== "undecided") facts.push({ title: "Mode", value: MODE_LABEL[d.mode] ?? d.mode });
  const dates = d.absentFrom ? `${d.absentFrom}${d.absentTo && d.absentTo !== d.absentFrom ? ` → ${d.absentTo}` : ""}` : null;
  if (dates) facts.push({ title: "Session dates", value: dates });
  if (d.timeFrom) facts.push({ title: "Time", value: `${d.timeFrom}${d.timeTo ? ` – ${d.timeTo}` : ""}` });
  const deadline = fmtDeadline(d.dueAt);
  if (deadline) facts.push({ title: "Deadline", value: deadline });

  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      { type: "TextBlock", text: `⏰ Upload your invoice — ${d.ticketNo}`, weight: "Bolder", size: "Medium", color: "Attention", wrap: true },
      { type: "TextBlock", text: "Backup OS · offline claim · your 24-hour window is open", isSubtle: true, spacing: "None", size: "Small", wrap: true },
      { type: "FactSet", facts },
      { type: "TextBlock", text: "Please file the NxtClaim link + charge slips now. This reminder repeats every 5 hours until you upload.", wrap: true, isSubtle: true, size: "Small", spacing: "Small" },
      { type: "ActionSet", actions: [{ type: "Action.OpenUrl", title: "Upload in Backup OS →", url: d.ticketUrl }] },
    ],
  };
  return { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] };
}

/** POST the card to the Teams Workflow URL. Returns true on 2xx. Never throws. */
export async function postToTeams(webhookUrl: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
