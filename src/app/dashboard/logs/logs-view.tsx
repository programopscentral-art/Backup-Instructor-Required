"use client";

import { useMemo, useState } from "react";
import { Search, History, ShieldCheck } from "lucide-react";
import { FadeIn } from "@/components/ui/motion";

export interface LogEvent {
  id: string;
  time: string;
  actor: string;
  university: string;
  category: "Ticket" | "Directory";
  action: string;
  target: string;
  note: string;
}
export interface AuditEvent {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  target_email: string | null;
  role: string | null;
  detail: string | null;
}

const ACTION_LABEL: Record<string, string> = {
  grant_role: "Granted role",
  revoke_role: "Revoked role",
  delete_grant: "Removed pending grant",
};

export function LogsView({
  events,
  audit,
  isAdmin,
}: {
  events: LogEvent[];
  audit: AuditEvent[];
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<"activity" | "access">("activity");
  const [uni, setUni] = useState("");
  const [q, setQ] = useState("");

  const universities = useMemo(
    () => Array.from(new Set(events.map((e) => e.university).filter((u) => u && u !== "—"))).sort(),
    [events],
  );

  const [cat, setCat] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (uni && e.university !== uni) return false;
      if (cat && e.category !== cat) return false;
      if (needle) {
        const hay = `${e.actor} ${e.university} ${e.category} ${e.action} ${e.target} ${e.note}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [events, uni, q, cat]);

  const fmt = (t: string) =>
    new Date(t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div>
      {isAdmin && (
        <div className="mb-5 flex gap-1 rounded-full border border-[color:var(--line)] bg-white p-1" style={{ width: "fit-content" }}>
          <button
            onClick={() => setTab("activity")}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={{ background: tab === "activity" ? "var(--accent-soft)" : "transparent", color: tab === "activity" ? "var(--accent)" : "var(--muted)" }}
          >
            <History size={15} /> University activity
          </button>
          <button
            onClick={() => setTab("access")}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
            style={{ background: tab === "access" ? "var(--accent-soft)" : "transparent", color: tab === "access" ? "var(--accent)" : "var(--muted)" }}
          >
            <ShieldCheck size={15} /> Access history
          </button>
        </div>
      )}

      {tab === "activity" && (
        <FadeIn>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--faint)]" />
              <input className="input !w-64 !py-2 !pl-9 !text-[13px]" placeholder="Search activity…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {universities.length > 1 && (
              <select className="select !w-auto !py-2 !text-[13px]" value={uni} onChange={(e) => setUni(e.target.value)}>
                <option value="">All universities</option>
                {universities.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
            <select className="select !w-auto !py-2 !text-[13px]" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All types</option>
              <option value="Ticket">Tickets</option>
              <option value="Directory">Directory changes</option>
            </select>
            <span className="ml-auto text-xs text-[color:var(--muted)]">{filtered.length} events</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>University</th>
                    <th>Type</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-[color:var(--muted)]">{fmt(e.time)}</td>
                      <td>{e.university}</td>
                      <td>
                        <span className={`pill ${e.category === "Directory" ? "pill-violet" : "pill-info"}`}>{e.category}</span>
                      </td>
                      <td className="font-semibold">{e.action}</td>
                      <td className="text-[color:var(--muted)]">{e.target}</td>
                      <td className="text-[color:var(--muted)]">{e.actor}</td>
                      <td className="max-w-xs truncate text-[color:var(--muted)]">{e.note}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm text-[color:var(--faint)]">
                        No activity yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      )}

      {tab === "access" && isAdmin && (
        <FadeIn>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Role</th>
                    <th>By</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap text-[color:var(--muted)]">{fmt(a.created_at)}</td>
                      <td>
                        <span className={`pill ${a.action === "revoke_role" || a.action === "delete_grant" ? "pill-crit" : "pill-good"}`}>
                          {ACTION_LABEL[a.action] ?? a.action}
                        </span>
                      </td>
                      <td>{a.target_email ?? "—"}</td>
                      <td className="text-[color:var(--muted)]">{a.role ?? "—"}</td>
                      <td className="text-[color:var(--muted)]">{a.actor_name ?? "—"}</td>
                      <td className="text-[color:var(--muted)]">{a.detail ?? "—"}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-sm text-[color:var(--faint)]">
                        No access changes recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
