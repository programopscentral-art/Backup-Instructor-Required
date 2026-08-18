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
interface Cm {
  user_id: string;
  name: string;
  email: string;
  capability: string | null;
}

const NEW = "__new__";

export function CapabilitySetup({
  ticketId,
  subjectId,
  capabilities,
  cmUsers,
}: {
  ticketId: string;
  subjectId: string;
  capabilities: Cap[];
  cmUsers: Cm[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(assignCapability, {});
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [managerMode, setManagerMode] = useState<"user" | "text">("user");

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="subject_id" value={subjectId} />

      <div className="flex items-start gap-2 rounded-xl border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2.5 text-sm text-[color:var(--rose)]">
        <AlertTriangle size={16} className="mt-0.5 flex-none" />
        <span>This subject has no Capability Manager. Assign one first, then add backups and assign.</span>
      </div>

      <div>
        <label className="label flex items-center gap-1.5">
          <UserCog size={14} /> Capability &amp; Manager
        </label>
        <select name="capability_id" value={choice} onChange={(e) => setChoice(e.target.value)} required className="select">
          <option value="" disabled>
            Select a capability…
          </option>
          {capabilities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.manager_name ? ` · CM ${c.manager_name}` : " · (no manager)"}
            </option>
          ))}
          <option value={NEW}>+ Create new capability…</option>
        </select>
      </div>

      {choice === NEW && (
        <div className="space-y-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] p-3">
          <div>
            <label className="label">New capability name</label>
            <input name="new_name" placeholder="e.g. Operating Systems & OS Principles" className="input" />
          </div>
          <div>
            <label className="label">Manager</label>
            <div className="mb-2 flex gap-2 text-xs">
              <button type="button" onClick={() => setManagerMode("user")} className={`rounded-full px-3 py-1 font-semibold ${managerMode === "user" ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)]" : "text-[color:var(--muted)]"}`}>
                Pick a manager
              </button>
              <button type="button" onClick={() => setManagerMode("text")} className={`rounded-full px-3 py-1 font-semibold ${managerMode === "text" ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)]" : "text-[color:var(--muted)]"}`}>
                Type a name
              </button>
            </div>
            {managerMode === "user" ? (
              <select name="manager_user_id" className="select">
                <option value="">— select a capability manager —</option>
                {cmUsers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name || m.email}
                    {m.capability ? ` · ${m.capability}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input name="manager_name" placeholder="Manager full name" className="input" />
            )}
          </div>
        </div>
      )}

      {state.error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Assigning…" : "Assign Capability Manager"}
      </button>
    </form>
  );
}
