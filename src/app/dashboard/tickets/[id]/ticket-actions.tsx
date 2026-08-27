"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { transitionTicket, type ActionState } from "../actions";
import type { TicketStatus, TicketMode } from "@/lib/tickets/status";

interface PoolItem {
  id: string;
  instructor_name: string;
  emp_id: string | null;
  email: string | null; // needed for notifications, login & invoice upload
  availability_mode: string;
  current_status: string;
  load?: number;
  busy?: boolean; // date clash with this ticket's dates
}

/** Availability tag + sort rank for a pool instructor (best pick first). */
function poolTag(p: PoolItem): { text: string; rank: number } {
  if (p.busy) return { text: "⚠ busy — date clash", rank: 3 };
  if (p.current_status === "on_leave") return { text: "on leave", rank: 4 };
  const load = p.load ?? 0;
  if (load > 0) return { text: `${load} active`, rank: load >= 3 ? 2 : 1 };
  return { text: "free", rank: 0 };
}
interface Perms {
  canAssign: boolean;
  canConfirm: boolean;
  canApprove: boolean;
  isHod: boolean;
  isAdmin: boolean;
}

export function TicketActions({
  ticketId,
  status,
  mode,
  pool,
  perms,
  capabilityId = null,
}: {
  ticketId: string;
  status: TicketStatus;
  mode: TicketMode;
  pool: PoolItem[];
  perms: Perms;
  capabilityId?: string | null;
}) {
  if (status === "closed" || status === "cancelled") {
    return (
      <p className="text-sm text-[color:var(--muted)]">
        This ticket is {status}. No further actions.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {status === "raised" && perms.canAssign && (
        <AssignForm ticketId={ticketId} pool={pool} capabilityId={capabilityId} />
      )}

      {status === "backup_assigned" && perms.canConfirm && (
        <Transition
          ticketId={ticketId}
          buttons={[{ action: "confirm", label: "Confirm & dispatch backup" }]}
          hint="Confirms the backup and notifies the university and instructor."
        />
      )}

      {status === "confirmed" && perms.canConfirm && (
        <Transition
          ticketId={ticketId}
          buttons={[{ action: "session", label: "Mark session delivered" }]}
          hint="Mark once the backup has taken the session."
        />
      )}

      {status === "session_done" && perms.canConfirm && (
        <Transition
          ticketId={ticketId}
          hint={
            mode === "offline"
              ? "Offline session — proceed to the 24-hour invoice step."
              : mode === "online"
                ? "Online session — no invoice needed, close it out."
                : "Choose the outcome based on how the session was delivered."
          }
          buttons={
            mode === "offline"
              ? [{ action: "to_invoice", label: "Proceed to invoice" }]
              : mode === "online"
                ? [{ action: "close_online", label: "Close (online — no claim)" }]
                : [
                    { action: "to_invoice", label: "Offline → invoice" },
                    { action: "close_online", label: "Online → close", ghost: true },
                  ]
          }
        />
      )}

      {status === "invoice_pending" && perms.canApprove && (
        <Transition
          ticketId={ticketId}
          buttons={[{ action: "ops_approve", label: "Ops: approve claim" }]}
          hint="First approval. Invoice upload (NxtClaim + slips) arrives in the Invoices module."
        />
      )}

      {status === "ops_approved" && perms.isHod && (
        <Transition
          ticketId={ticketId}
          buttons={[{ action: "hod_approve", label: "HOD: final approval" }]}
          hint="Final sign-off before the ticket is settled."
        />
      )}

      {status === "hod_approved" && perms.canApprove && (
        <Transition
          ticketId={ticketId}
          buttons={[{ action: "close", label: "Close ticket" }]}
          hint="Fully approved — close it out."
        />
      )}

      {perms.isAdmin && (
        <div className="border-t border-[color:var(--line)] pt-4">
          <Transition
            ticketId={ticketId}
            buttons={[{ action: "cancel", label: "Cancel ticket", danger: true }]}
            hint="Cancelling stops the ticket. This is logged."
            compact
          />
        </div>
      )}
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AssignForm({
  ticketId,
  pool,
  capabilityId,
}: {
  ticketId: string;
  pool: PoolItem[];
  capabilityId: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transitionTicket, {});
  const supabase = createClient();
  const [localPool, setLocalPool] = useState(pool);
  const [selectedId, setSelectedId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [addingPool, setAddingPool] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newEmp, setNewEmp] = useState("");
  const [newMode, setNewMode] = useState("both");
  const [busy, setBusy] = useState(false);
  const [poolErr, setPoolErr] = useState<string | null>(null);
  const [poolInfo, setPoolInfo] = useState<string | null>(null);

  async function addToPool() {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name) return setPoolErr("Enter an instructor name.");
    // Email is required here so the backup can actually be notified, sign in,
    // and upload their invoice — the whole reason to add them.
    if (!email) return setPoolErr("Enter an email — without it the backup can't be notified or upload a claim.");
    if (!EMAIL_RE.test(email)) return setPoolErr("Enter a valid email address.");
    if (!capabilityId) return setPoolErr("No capability set on this ticket.");
    // Already in this capability's pool? Reuse that row instead of duplicating.
    const dupe = localPool.find((p) => (p.email ?? "").toLowerCase() === email);
    if (dupe) {
      setSelectedId(dupe.id);
      setTypedName("");
      setAddingPool(false);
      setPoolErr(null);
      setPoolInfo(`${dupe.instructor_name} is already in this pool — selected them.`);
      return;
    }
    setBusy(true);
    setPoolErr(null);
    setPoolInfo(null);
    const { data, error } = await supabase
      .from("backup_instructor_pool")
      .insert({
        instructor_name: name,
        email,
        emp_id: newEmp.trim() || null,
        capability_id: capabilityId,
        availability_mode: newMode,
        current_status: "available",
        status: "active",
      })
      .select("id, instructor_name, emp_id, email, availability_mode, current_status")
      .single();
    setBusy(false);
    if (error || !data) {
      return setPoolErr(
        /duplicate|unique/i.test(error?.message ?? "")
          ? "A backup with that email already exists in this pool."
          : error?.message ?? "Failed to add.",
      );
    }
    setLocalPool((l) => [...l, data]);
    // Auto-select the just-added backup so the next click is simply "Assign".
    setSelectedId(data.id);
    setTypedName("");
    setNewName("");
    setNewEmail("");
    setNewEmp("");
    setNewMode("both");
    setAddingPool(false);
  }

  const selectedPool = localPool.find((p) => p.id === selectedId) || null;
  // The name/id that will actually be submitted (pool selection wins over typed).
  const submitId = selectedPool ? selectedPool.id : "";
  const submitName = selectedPool ? selectedPool.instructor_name : typedName.trim();
  const canSubmit = !!submitName;

  // Reachability: will this backup actually get notified / be able to upload?
  const unreachable =
    (selectedPool && !selectedPool.email) || (!selectedPool && !!typedName.trim());
  const unreachableMsg = selectedPool
    ? "This backup has no email on file, so they won't be notified and can't sign in to upload their invoice. Add an email in Directories → Backup Pool first."
    : "Typed-in names aren't in the pool, so this backup can't be notified or upload a claim. Use “+ Add to pool” with an email instead.";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="action" value="assign" />
      <input type="hidden" name="assigned_backup_id" value={submitId} />
      <input type="hidden" name="assigned_backup_name" value={submitName} />
      <div>
        <div className="flex items-center justify-between">
          <label className="label">Backup instructor (from pool)</label>
          {capabilityId && !addingPool && (
            <button type="button" onClick={() => setAddingPool(true)} className="text-xs font-semibold text-[color:var(--accent)] hover:underline">
              + Add to pool
            </button>
          )}
        </div>
        {addingPool ? (
          <div className="space-y-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] p-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[color:var(--muted)]">Backup instructor name <span className="text-[color:var(--rose)]">*</span></label>
              <input className="input" placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[color:var(--muted)]">Email — for login &amp; alerts <span className="text-[color:var(--rose)]">*</span></label>
              <input className="input" type="email" placeholder="name@nxtwave.co.in" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-[color:var(--muted)]">Emp ID</label>
                <input className="input" placeholder="Optional" value={newEmp} onChange={(e) => setNewEmp(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-[color:var(--muted)]">Mode</label>
                <select className="select" value={newMode} onChange={(e) => setNewMode(e.target.value)}>
                  <option value="both">Both</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={addToPool} disabled={busy} className="btn btn-primary btn-sm">
                {busy ? "Adding…" : "Add to pool"}
              </button>
              <button type="button" onClick={() => { setAddingPool(false); setPoolErr(null); }} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
            <p className="text-xs text-[color:var(--faint)]">Permanently adds this backup to the capability&apos;s pool. The email lets them get alerts, sign in, and upload their invoice.</p>
            {poolErr && <p className="text-xs text-[color:var(--rose)]">{poolErr}</p>}
          </div>
        ) : localPool.length > 0 ? (
          <>
            <select
              className="select"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                if (e.target.value) setTypedName("");
              }}
            >
              <option value="">Select…</option>
              {[...localPool]
                .sort((a, b) => {
                  const ra = poolTag(a).rank;
                  const rb = poolTag(b).rank;
                  if (ra !== rb) return ra - rb;
                  return (a.load ?? 0) - (b.load ?? 0);
                })
                .map((p) => {
                  const tag = poolTag(p);
                  return (
                    <option key={p.id} value={p.id}>
                      {tag.rank === 0 ? "✓ " : tag.rank >= 3 ? "⚠ " : ""}
                      {p.instructor_name}
                      {p.emp_id ? ` (${p.emp_id})` : ""} · {p.availability_mode} · {tag.text}
                      {p.email ? "" : " · ✉ no email"}
                    </option>
                  );
                })}
            </select>
            <p className="mt-1.5 text-xs text-[color:var(--faint)]">
              Sorted best-first · <span className="font-semibold text-[color:var(--rose)]">⚠ busy</span> = already booked for these dates · <span className="font-semibold">N active</span> = current load · <span className="font-semibold">✉ no email</span> = can&apos;t be notified
            </p>
          </>
        ) : (
          <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
            No backups in this capability&apos;s pool yet. Use &ldquo;+ Add to pool&rdquo;, or type a name below.
          </p>
        )}
      </div>
      <div>
        <label className="label">…or type a backup name</label>
        <input
          className="input"
          placeholder="Backup instructor name"
          value={typedName}
          onChange={(e) => {
            setTypedName(e.target.value);
            if (e.target.value) setSelectedId("");
          }}
        />
      </div>
      <div>
        <label className="label">Delivery mode (Ops decision)</label>
        <select name="mode" defaultValue="offline" className="select">
          <option value="offline">Offline (on-campus)</option>
          <option value="online">Online</option>
        </select>
      </div>
      {poolInfo && (
        <p className="rounded-lg border border-[#bfe3cb] bg-[#eaf6ee] px-3 py-2 text-xs text-[#177245]">
          ✓ {poolInfo}
        </p>
      )}
      {unreachable && (
        <p className="rounded-lg border border-[#f3d19a] bg-[#fdf6e9] px-3 py-2 text-xs text-[#8a5a00]">
          ⚠ {unreachableMsg}
        </p>
      )}
      {state.error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending || !canSubmit} className="btn btn-primary w-full">
        {pending ? "Assigning…" : "Assign backup"}
      </button>
    </form>
  );
}

function Transition({
  ticketId,
  buttons,
  hint,
  compact,
}: {
  ticketId: string;
  buttons: { action: string; label: string; ghost?: boolean; danger?: boolean }[];
  hint?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transitionTicket, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      {!compact && hint && <p className="text-sm text-[color:var(--muted)]">{hint}</p>}
      {!compact && (
        <input name="note" placeholder="Optional note…" className="input" />
      )}
      {state.error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <button
            key={b.action}
            type="submit"
            name="action"
            value={b.action}
            disabled={pending}
            className={`btn ${b.danger ? "btn-danger" : b.ghost ? "btn-ghost" : "btn-primary"} ${compact ? "btn-sm" : ""}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {compact && hint && <p className="text-xs text-[color:var(--faint)]">{hint}</p>}
    </form>
  );
}
