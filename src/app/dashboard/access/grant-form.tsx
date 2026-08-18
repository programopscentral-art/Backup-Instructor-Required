"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { grantAccess, type GrantState } from "./actions";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/roles";

interface Option {
  id: string;
  name: string;
}

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export function GrantForm({
  universities,
  capabilities,
}: {
  universities: Option[];
  capabilities: Option[];
}) {
  const [state, action, pending] = useActionState<GrantState, FormData>(grantAccess, {});
  const [scopeType, setScopeType] = useState("global");

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" required placeholder="person@nxtwave.in" className="input" />
      </div>

      <div>
        <label className="label">Role</label>
        <select name="role" required defaultValue="" className="select">
          <option value="" disabled>
            Select a role…
          </option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Scope</label>
          <select
            name="scope_type"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
            className="select"
          >
            <option value="global">Global (all)</option>
            <option value="university">University</option>
            <option value="capability">Capability</option>
          </select>
        </div>
        <div>
          <label className="label">Scope target</label>
          <select name="scope_id" disabled={scopeType === "global"} className="select disabled:opacity-40">
            <option value="">{scopeType === "global" ? "—" : "Select…"}</option>
            {scopeType === "university" &&
              universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            {scopeType === "capability" &&
              capabilities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.1)] px-3 py-2 text-sm text-[color:var(--rose)]">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-[rgba(52,211,153,0.3)] bg-[rgba(52,211,153,0.1)] px-3 py-2 text-sm text-[color:var(--emerald)]">
          {state.ok}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        <UserPlus size={16} />
        {pending ? "Granting…" : "Grant access"}
      </button>
    </form>
  );
}
