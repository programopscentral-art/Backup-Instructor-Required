"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { transitionTicket, type ActionState } from "../actions";
import type { TicketStatus, TicketMode } from "@/lib/tickets/status";

interface PoolItem {
  id: string;
  instructor_name: string;
  emp_id: string | null;
  availability_mode: string;
  current_status: string;
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
  const [addingPool, setAddingPool] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmp, setNewEmp] = useState("");
  const [busy, setBusy] = useState(false);
  const [poolErr, setPoolErr] = useState<string | null>(null);

  async function addToPool() {
    if (!newName.trim()) return setPoolErr("Enter an instructor name.");
    if (!capabilityId) return setPoolErr("No capability set on this ticket.");
    setBusy(true);
    setPoolErr(null);
    const { data, error } = await supabase
      .from("backup_instructor_pool")
      .insert({
        instructor_name: newName.trim(),
        emp_id: newEmp.trim() || null,
        capability_id: capabilityId,
        availability_mode: "both",
        current_status: "available",
        status: "active",
      })
      .select("id, instructor_name, emp_id, availability_mode, current_status")
      .single();
    setBusy(false);
    if (error || !data) return setPoolErr(error?.message ?? "Failed to add.");
    setLocalPool((l) => [...l, data]);
    setNewName("");
    setNewEmp("");
    setAddingPool(false);
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="action" value="assign" />
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
            <input className="input" placeholder="Backup instructor name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <input className="input" placeholder="Emp ID (optional)" value={newEmp} onChange={(e) => setNewEmp(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" onClick={addToPool} disabled={busy} className="btn btn-primary btn-sm">
                Add to pool
              </button>
              <button type="button" onClick={() => setAddingPool(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
            <p className="text-xs text-[color:var(--faint)]">Permanently adds this backup to the capability&apos;s pool.</p>
            {poolErr && <p className="text-xs text-[color:var(--rose)]">{poolErr}</p>}
          </div>
        ) : localPool.length > 0 ? (
          <select
            name="assigned_backup_id"
            className="select"
            onChange={(e) => {
              const opt = e.target.selectedOptions[0];
              const hidden = e.currentTarget.form?.elements.namedItem("assigned_backup_name") as HTMLInputElement | null;
              if (hidden) hidden.value = opt?.dataset.name ?? "";
            }}
          >
            <option value="">Select…</option>
            {localPool.map((p) => (
              <option key={p.id} value={p.id} data-name={p.instructor_name}>
                {p.instructor_name}
                {p.emp_id ? ` (${p.emp_id})` : ""} · {p.availability_mode} · {p.current_status}
              </option>
            ))}
          </select>
        ) : (
          <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
            No backups in this capability&apos;s pool yet. Use &ldquo;+ Add to pool&rdquo;, or type a name below.
          </p>
        )}
      </div>
      <input type="hidden" name="assigned_backup_name" defaultValue="" />
      <div>
        <label className="label">…or type a backup name</label>
        <input
          className="input"
          placeholder="Backup instructor name"
          onChange={(e) => {
            const hidden = e.currentTarget.form?.elements.namedItem(
              "assigned_backup_name",
            ) as HTMLInputElement | null;
            if (hidden && e.target.value) hidden.value = e.target.value;
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
      {state.error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
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
