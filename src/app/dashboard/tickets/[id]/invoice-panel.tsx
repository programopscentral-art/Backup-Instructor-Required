"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, ExternalLink, AlertTriangle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { submitInvoice, reviewInvoice } from "@/app/dashboard/invoices/actions";

export interface InvoiceView {
  id: string;
  status: "submitted" | "ops_approved" | "hod_approved" | "returned";
  description: string | null;
  amount: number | null;
  travel_amount: number | null;
  accommodation_amount: number | null;
  other_amount: number | null;
  nxtclaim_link: string;
  late: boolean;
  submitted_by_name: string | null;
  session_date: string | null;
  return_reason: string | null;
  files: { name: string; url: string }[];
}

const INV_PILL: Record<string, string> = {
  submitted: "pill-info",
  ops_approved: "pill-accent",
  hod_approved: "pill-good",
  returned: "pill-crit",
};

export function InvoicePanel({
  ticketId,
  ticketStatus,
  overdue,
  invoice,
  canUpload,
  perms,
}: {
  ticketId: string;
  ticketStatus: string;
  overdue: boolean;
  invoice: InvoiceView | null;
  canUpload: boolean;
  perms: { isAdmin: boolean; isHod: boolean };
}) {
  const router = useRouter();

  if (!invoice) {
    return (
      <div className="space-y-4">
        {overdue && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#f6cdd6] bg-[#fdeef1] px-3.5 py-2.5 text-sm text-[color:var(--rose)]">
            <AlertTriangle size={17} className="mt-0.5 flex-none" />
            <span>
              <strong>Red flag:</strong> the 24-hour window has passed with no invoice.
              {canUpload ? " Submit it now." : " Awaiting the backup instructor."}
            </span>
          </div>
        )}
        {canUpload ? (
          <SubmitForm ticketId={ticketId} onDone={() => router.refresh()} />
        ) : (
          <WaitingForBackup />
        )}
      </div>
    );
  }

  // Returned for fix → let the submitter (backup instructor / Ops) correct and re-file.
  if (invoice.status === "returned") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2.5 text-sm text-[color:var(--rose)]">
          <strong>Returned:</strong> {invoice.return_reason ?? "Please correct the details and resubmit."}
        </div>
        {canUpload ? (
          <SubmitForm ticketId={ticketId} onDone={() => router.refresh()} />
        ) : (
          <p className="text-sm text-[color:var(--muted)]">
            The backup instructor needs to correct and re-file this claim.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${INV_PILL[invoice.status]}`}>
          {invoice.status.replace("_", " ")}
        </span>
        {invoice.late && <span className="pill pill-crit">Late</span>}
        {invoice.amount != null && (
          <span className="pill pill-muted">₹ {invoice.amount.toLocaleString("en-IN")}</span>
        )}
      </div>

      {(invoice.travel_amount != null || invoice.accommodation_amount != null || invoice.other_amount != null) && (
        <div className="flex flex-wrap gap-3 text-xs text-[color:var(--muted)]">
          <span>✈️ Travel: <strong className="text-[color:var(--ink)]">₹{(invoice.travel_amount ?? 0).toLocaleString("en-IN")}</strong></span>
          <span>🏨 Stay: <strong className="text-[color:var(--ink)]">₹{(invoice.accommodation_amount ?? 0).toLocaleString("en-IN")}</strong></span>
          <span>➕ Other: <strong className="text-[color:var(--ink)]">₹{(invoice.other_amount ?? 0).toLocaleString("en-IN")}</strong></span>
        </div>
      )}

      {invoice.description && <p className="text-sm text-[color:var(--ink)]">{invoice.description}</p>}

      <a
        href={invoice.nxtclaim_link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--accent)] hover:underline"
      >
        <ExternalLink size={14} /> NxtClaim link
      </a>

      {invoice.files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {invoice.files.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--cream)] px-3 py-2 text-sm text-[color:var(--ink)] hover:border-[color:var(--accent)]"
            >
              <FileText size={15} className="text-[color:var(--muted)]" />
              <span className="truncate">{f.name}</span>
            </a>
          ))}
        </div>
      )}


      <p className="text-xs text-[color:var(--faint)]">
        Filed by {invoice.submitted_by_name ?? "—"}
        {invoice.session_date && ` · session ${invoice.session_date}`}
      </p>

      <ReviewButtons
        ticketId={ticketId}
        ticketStatus={ticketStatus}
        invoiceId={invoice.id}
        invoiceStatus={invoice.status}
        perms={perms}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

/** Read-only note shown to anyone who isn't the assigned backup (e.g. the CM). */
function WaitingForBackup() {
  return (
    <div className="rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] px-4 py-3.5 text-sm text-[color:var(--muted)]">
      <p className="flex items-center gap-2 font-semibold text-[color:var(--ink)]">
        <FileText size={15} className="text-[color:var(--muted)]" /> Waiting on the backup instructor
      </p>
      <p className="mt-1.5">
        Only the assigned backup instructor can upload the offline claim (NxtClaim link
        + charge slips), within 24 hours of the session. You&apos;ll see it here once they file it.
      </p>
    </div>
  );
}

const MAX_SLIPS = 5;

function SubmitForm({ ticketId, onDone }: { ticketId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [travel, setTravel] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [other, setOther] = useState("");

  const num = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0);
  const total = num(travel) + num(accommodation) + num(other);

  async function handle(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const input = (formData.getAll("slips") as File[]).filter((f) => f && f.size > 0);
      if (input.length > MAX_SLIPS) {
        setError(`You can upload at most ${MAX_SLIPS} files.`);
        setBusy(false);
        return;
      }
      const uploaded: { path: string; name: string }[] = [];
      for (const file of input) {
        if (!file || file.size === 0) continue;
        const path = `${ticketId}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
        if (upErr) {
          setError(`Upload failed: ${upErr.message}`);
          setBusy(false);
          return;
        }
        uploaded.push({ path, name: file.name });
      }
      formData.set("files", JSON.stringify(uploaded));
      formData.set("ticket_id", ticketId);
      const res = await submitInvoice({}, formData);
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form action={handle} className="space-y-4">
      <p className="text-sm text-[color:var(--muted)]">
        Offline session — file the claim within 24 hours.
      </p>
      <div>
        <label className="label">Description *</label>
        <input name="description" required placeholder="e.g. Travel + on-campus session" className="input" />
      </div>
      <div>
        <label className="label">Session date</label>
        <input name="session_date" type="date" className="input" />
      </div>
      <div>
        <label className="label">Claim breakdown (₹)</label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <input name="travel_amount" type="number" min="0" step="0.01" placeholder="Travel" className="input" value={travel} onChange={(e) => setTravel(e.target.value)} />
            <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--faint)]">Travel</p>
          </div>
          <div>
            <input name="accommodation_amount" type="number" min="0" step="0.01" placeholder="Stay" className="input" value={accommodation} onChange={(e) => setAccommodation(e.target.value)} />
            <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--faint)]">Accommodation</p>
          </div>
          <div>
            <input name="other_amount" type="number" min="0" step="0.01" placeholder="Other" className="input" value={other} onChange={(e) => setOther(e.target.value)} />
            <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[color:var(--faint)]">Other</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-[color:var(--cream)] px-3 py-2 text-sm">
          <span className="font-semibold text-[color:var(--muted)]">Total claim</span>
          <span className="font-[family-name:var(--font-display)] font-bold text-[color:var(--ink)]">₹ {total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      <div>
        <label className="label">NxtClaim link *</label>
        <input name="nxtclaim_link" required placeholder="https://nxtclaim…" className="input" />
      </div>
      <div>
        <label className="label">Charge slips / receipts * (max {MAX_SLIPS})</label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--line-2)] bg-[color:var(--cream)] px-3 py-4 text-sm text-[color:var(--muted)] hover:border-[color:var(--accent)]">
          <Upload size={16} />
          {fileNames.length ? `${fileNames.length} file(s) selected` : `Choose files (up to ${MAX_SLIPS})`}
          <input
            name="slips"
            type="file"
            multiple
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length > MAX_SLIPS) {
                setError(`You can upload at most ${MAX_SLIPS} files.`);
                e.target.value = "";
                setFileNames([]);
                return;
              }
              setError(null);
              setFileNames(fs.map((f) => f.name));
            }}
          />
        </label>
        {fileNames.length > 0 && (
          <ul className="mt-2 space-y-1">
            {fileNames.map((n) => (
              <li key={n} className="flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
                <FileText size={12} /> {n}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? "Submitting…" : "Submit invoice"}
      </button>
    </form>
  );
}

function ReviewButtons({
  ticketId,
  ticketStatus,
  invoiceId,
  invoiceStatus,
  perms,
  onDone,
}: {
  ticketId: string;
  ticketStatus: string;
  invoiceId: string;
  invoiceStatus: string;
  perms: { isAdmin: boolean; isHod: boolean };
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");

  async function run(action: string) {
    setBusy(action);
    setError(null);
    const fd = new FormData();
    fd.set("invoice_id", invoiceId);
    fd.set("ticket_id", ticketId);
    fd.set("action", action);
    if (action === "return") fd.set("reason", reason);
    const res = await reviewInvoice({}, fd);
    if (res.error) {
      setError(res.error);
      setBusy(null);
      return;
    }
    onDone();
  }

  const showOps = ticketStatus === "invoice_pending" && invoiceStatus === "submitted" && perms.isAdmin;
  const showHod = ticketStatus === "ops_approved" && perms.isHod;
  const showClose = ticketStatus === "hod_approved" && perms.isAdmin;

  if (!showOps && !showHod && !showClose) {
    return error ? <p className="text-sm text-[color:var(--rose)]">{error}</p> : null;
  }

  return (
    <div className="space-y-3 border-t border-[color:var(--line)] pt-4">
      {error && <p className="text-sm text-[color:var(--rose)]">{error}</p>}
      {showOps && (
        <>
          {returning ? (
            <div className="space-y-2">
              <input
                className="input"
                placeholder="Reason to return…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => run("return")} disabled={busy !== null} className="btn btn-danger btn-sm">
                  Confirm return
                </button>
                <button onClick={() => setReturning(false)} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => run("ops")} disabled={busy !== null} className="btn btn-primary">
                <Check size={15} /> Ops approve
              </button>
              <button onClick={() => setReturning(true)} className="btn btn-ghost">
                Return
              </button>
            </div>
          )}
        </>
      )}
      {showHod && (
        <button onClick={() => run("hod")} disabled={busy !== null} className="btn btn-primary w-full">
          <Check size={15} /> HOD final approval
        </button>
      )}
      {showClose && (
        <button onClick={() => run("close")} disabled={busy !== null} className="btn btn-primary w-full">
          Close ticket
        </button>
      )}
    </div>
  );
}
