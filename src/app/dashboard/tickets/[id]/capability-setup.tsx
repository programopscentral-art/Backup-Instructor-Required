"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCog, AlertTriangle } from "lucide-react";
import { assignCapability, type ActionState } from "../actions";

interface Cap {
  id: string;
  name: string;
  manager_name: string | null;
}

const NEW = "__new__";

/**
 * Resolve a "needs admin" ticket: pick the subject VERTICAL (capability) it
 * belongs to — or add a brand-new vertical + its first Capability Manager
 * (name + email, so the CM is notifiable and can sign in). Once linked, the
 * subject routes automatically forever after.
 */
export function CapabilitySetup({
  ticketId,
  subjectId,
  capabilities,
}: {
  ticketId: string;
  subjectId: string;
  capabilities: Cap[];
  cmUsers?: unknown; // (legacy prop — no longer used)
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(assignCapability, {});
  const router = useRouter();
  const [choice, setChoice] = useState("");

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const isNew = choice === NEW;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="subject_id" value={subjectId} />

      <div className="flex items-start gap-2 rounded-xl border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2.5 text-sm text-[color:var(--rose)]">
        <AlertTriangle size={16} className="mt-0.5 flex-none" />
        <span>This subject isn&apos;t mapped to a subject vertical yet. Pick the vertical it belongs to, or add a new one — then it routes to that vertical&apos;s Capability Managers.</span>
      </div>

      <div>
        <label className="label flex items-center gap-1.5">
          <UserCog size={14} /> Subject vertical
        </label>
        {/* Verticals by NAME only — a vertical can have several CMs, so naming one
            here would be misleading. */}
        <select name="capability_id" value={choice} onChange={(e) => setChoice(e.target.value)} required className="select">
          <option value="" disabled>
            Select a subject vertical…
          </option>
          {capabilities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW}>+ Add a new subject vertical…</option>
        </select>
      </div>

      {isNew && (
        <div className="space-y-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] p-3">
          <div>
            <label className="label">
              New subject vertical name <span className="text-[color:var(--rose)]">*</span>
            </label>
            <input name="new_name" placeholder="e.g. Gen AI" className="input" autoFocus />
          </div>
          <div>
            <label className="label">
              Capability Manager name <span className="text-[color:var(--rose)]">*</span>
            </label>
            <input name="manager_name" placeholder="Full name" className="input" />
          </div>
          <div>
            <label className="label">
              Capability Manager email <span className="text-[color:var(--rose)]">*</span>
            </label>
            <input name="manager_email" type="email" placeholder="name@nxtwave.co.in" className="input" />
          </div>
          <p className="text-xs text-[color:var(--faint)]">
            Creates the vertical and its first CM — the email lets them get alerts, sign in, and manage backups. Add more CMs any time in Directory → Capability Managers.
          </p>
        </div>
      )}

      {state.error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : isNew ? "Create vertical & assign" : "Assign to vertical"}
      </button>
    </form>
  );
}
