import { redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { STATUS_META, MODE_LABEL, type TicketStatus, type TicketMode } from "@/lib/tickets/status";
import { AnalyticsFilters } from "./filters";
import { AnalyticsInteractive } from "./analytics-interactive";

export const dynamic = "force-dynamic";

type Gran = "day" | "week" | "month" | "year";
const GRANS: Gran[] = ["day", "week", "month", "year"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Bucket a timestamp into a {key,label} for the chosen granularity. */
function bucketOf(iso: string, gran: Gran): { key: string; label: string } {
  // Bucket by IST wall-clock, not the server's UTC — otherwise tickets created
  // between 00:00–05:30 IST fall into the previous day.
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const y = d.getFullYear();
  if (gran === "year") return { key: String(y), label: String(y) };
  if (gran === "month") {
    return {
      key: `${y}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
    };
  }
  if (gran === "week") {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    return {
      key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    };
  }
  return {
    key: `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  };
}

interface Row {
  id: string;
  ticket_no: string | null;
  status: TicketStatus;
  mode: TicketMode;
  reason_category: string | null;
  university_id: string | null;
  created_at: string;
  red_flag: boolean | null;
  assigned_backup_name: string | null;
  universities: { name: string; state: string | null } | null;
  subjects: { name: string } | null;
  capabilities: { name: string; manager_name: string | null } | null;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const adminLike = isAdminLike(ctx.roles);
  const isStaff = ctx.roles.includes("university_staff");
  if (!adminLike && !isStaff) redirect("/dashboard");

  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const granularity = (GRANS.includes(str(sp.granularity) as Gran) ? str(sp.granularity) : "month") as Gran;
  const from = str(sp.from);
  const to = str(sp.to);
  const university = adminLike ? str(sp.university) : "";

  // RLS-scoped: university_staff only get their campus's tickets automatically.
  const supabase = await createAuthedClient();
  let query = supabase
    .from("tickets")
    .select(
      "id, ticket_no, status, mode, reason_category, university_id, created_at, red_flag, assigned_backup_name, universities(name, state), subjects(name), capabilities(name, manager_name)",
    );
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (university) query = query.eq("university_id", university);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  // Invoice budget per ticket (travel / accommodation / other / total).
  const invMap = new Map<string, { amount: number; travel: number; accommodation: number; other: number }>();
  if (rows.length) {
    const { data: invs } = await supabase
      .from("invoices")
      .select("ticket_id, amount, travel_amount, accommodation_amount, other_amount")
      .in("ticket_id", rows.map((r) => r.id));
    for (const iv of (invs ?? []) as { ticket_id: string; amount: number | null; travel_amount: number | null; accommodation_amount: number | null; other_amount: number | null }[]) {
      invMap.set(iv.ticket_id, {
        amount: iv.amount ?? 0,
        travel: iv.travel_amount ?? 0,
        accommodation: iv.accommodation_amount ?? 0,
        other: iv.other_amount ?? 0,
      });
    }
  }

  // ---- Aggregate (for the charts below; KPIs are computed in the client) ----
  const total = rows.length;

  const countBy = <K extends string>(pick: (r: Row) => K | null) => {
    const m = new Map<K, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k == null || k === "") continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const byStatus = countBy((r) => r.status);
  const byReason = countBy((r) => (r.reason_category as string | null) ?? null);
  const byUniversity = countBy((r) => r.universities?.name ?? null);
  const byCM = countBy((r) => r.capabilities?.manager_name ?? null);

  // Time series (chronological) with online/offline split.
  const tsMap = new Map<string, { label: string; offline: number; online: number; other: number }>();
  for (const r of rows) {
    const b = bucketOf(r.created_at, granularity);
    let cur = tsMap.get(b.key);
    if (!cur) {
      cur = { label: b.label, offline: 0, online: 0, other: 0 };
      tsMap.set(b.key, cur);
    }
    if (r.mode === "offline") cur.offline += 1;
    else if (r.mode === "online") cur.online += 1;
    else cur.other += 1;
  }
  const series = [...tsMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([, v]) => v);

  // Average time-to-close (days) — from the ticket's "closed" event.
  const closedIds = rows.filter((r) => r.status === "closed").map((r) => r.id);
  const closedAt = new Map<string, string>();
  if (closedIds.length) {
    const { data: evs } = await supabase
      .from("ticket_events")
      .select("ticket_id, created_at")
      .eq("to_status", "closed")
      .in("ticket_id", closedIds);
    for (const e of (evs ?? []) as { ticket_id: string; created_at: string }[]) {
      const cur = closedAt.get(e.ticket_id);
      if (!cur || e.created_at < cur) closedAt.set(e.ticket_id, e.created_at);
    }
  }

  // Enriched rows for the interactive KPI drill-downs + budget explorer.
  const explorerRows = rows.map((r) => {
    const inv = invMap.get(r.id);
    const ca = closedAt.get(r.id);
    const daysToClose =
      r.status === "closed" && ca ? (new Date(ca).getTime() - new Date(r.created_at).getTime()) / 86_400_000 : null;
    return {
      id: r.id,
      ticket_no: r.ticket_no ?? "—",
      status: r.status,
      mode: r.mode,
      reason: r.reason_category,
      university: r.universities?.name ?? "—",
      state: r.universities?.state ?? "Unknown",
      subject: r.subjects?.name ?? "—",
      backup: r.assigned_backup_name,
      created_at: r.created_at,
      red_flag: r.red_flag === true,
      amount: inv?.amount ?? 0,
      travel: inv?.travel ?? 0,
      accommodation: inv?.accommodation ?? 0,
      other: inv?.other ?? 0,
      daysToClose: daysToClose != null && daysToClose >= 0 ? daysToClose : null,
    };
  });

  const statusItems = (Object.keys(STATUS_META) as TicketStatus[])
    .map((s) => ({ label: STATUS_META[s].label, value: byStatus.get(s) ?? 0 }))
    .filter((x) => x.value > 0);
  const reasonItems = [...byReason.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const uniItems = [...byUniversity.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const cmItems = [...byCM.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const refs = adminLike ? await getRefs() : null;
  const scopeLabel = adminLike
    ? university
      ? refs?.universities.map[university] ?? "Selected university"
      : "All universities"
    : "Your campus";

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Backup ticket analytics"
        subtitle={`${scopeLabel} · grouped by ${granularity}${from || to ? ` · ${from || "start"} → ${to || "now"}` : ""}`}
      />

      <FadeIn>
        <AnalyticsFilters
          universities={refs?.universities.options ?? []}
          isAdmin={adminLike}
          current={{ granularity, from, to, university }}
        />
      </FadeIn>

      {/* Clickable KPIs + budget explorer */}
      <FadeIn delay={0.05}>
        <AnalyticsInteractive rows={explorerRows} />
      </FadeIn>

      {/* Time series with online/offline split */}
      <FadeIn delay={0.1} className="mt-6">
        <div className="card p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-base font-bold">Tickets over time</h2>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">Raised per {granularity} · online vs offline</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[color:var(--muted)]">
              <Legend color={MODE_COLORS.offline} label="Offline" />
              <Legend color={MODE_COLORS.online} label="Online" />
              <Legend color={MODE_COLORS.other} label="Undecided" />
            </div>
          </div>
          <TimeBars series={series} />
        </div>
      </FadeIn>

      {/* Breakdowns */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <FadeIn delay={0.15}>
          <div className="card p-6">
            <h2 className="mb-5 font-[family-name:var(--font-display)] text-base font-bold">By status</h2>
            <BarList items={statusItems} total={total} />
          </div>
        </FadeIn>
        <FadeIn delay={0.2}>
          <div className="card p-6">
            <h2 className="mb-5 font-[family-name:var(--font-display)] text-base font-bold">By reason</h2>
            <BarList items={reasonItems} total={total} />
          </div>
        </FadeIn>
        <FadeIn delay={0.25}>
          <div className="card p-6">
            <h2 className="mb-1 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
              <UserCog size={16} className="text-[color:var(--accent)]" /> CM workload
            </h2>
            <p className="mb-5 text-xs text-[color:var(--muted)]">Tickets per Capability Manager</p>
            <BarList items={cmItems} total={total} />
          </div>
        </FadeIn>
        {adminLike && (
          <FadeIn delay={0.3}>
            <div className="card p-6">
              <h2 className="mb-5 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
                By university {university && <span className="pill pill-muted">filtered</span>}
              </h2>
              <BarList items={uniItems} total={total} />
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
}

const MODE_COLORS = {
  offline: "rgb(109,40,217)",
  online: "rgb(4,120,87)",
  other: "rgb(148,163,184)",
};

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Horizontal labelled bars. */
function BarList({ items, total }: { items: { label: string; value: number }[]; total: number }) {
  if (items.length === 0) return <p className="text-sm text-[color:var(--faint)]">No data for this range.</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm text-[color:var(--ink)]">{it.label}</span>
            <span className="shrink-0 text-sm font-semibold text-[color:var(--ink)]">
              {it.value}
              {total > 0 && (
                <span className="ml-1 text-xs font-normal text-[color:var(--faint)]">
                  {Math.round((it.value / total) * 100)}%
                </span>
              )}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--cream-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${(it.value / max) * 100}%`, background: "var(--accent)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical time-series bars, stacked by mode (offline / online / undecided). */
function TimeBars({ series }: { series: { label: string; offline: number; online: number; other: number }[] }) {
  if (series.length === 0) return <p className="text-sm text-[color:var(--faint)]">No data for this range.</p>;
  const totals = series.map((s) => s.offline + s.online + s.other);
  const max = Math.max(...totals, 1);
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: 200 }}>
      {series.map((s, i) => {
        const t = totals[i];
        const seg = (v: number) => (t > 0 ? (v / t) * (t / max) * 100 : 0);
        return (
          <div key={i} className="flex min-w-[28px] flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-semibold text-[color:var(--ink)]">{t}</span>
            <div className="flex w-full flex-1 flex-col justify-end" title={`${s.label}: ${t} (offline ${s.offline}, online ${s.online})`}>
              {s.other > 0 && <div className="w-full" style={{ height: `${seg(s.other)}%`, background: MODE_COLORS.other }} />}
              {s.online > 0 && <div className="w-full" style={{ height: `${seg(s.online)}%`, background: MODE_COLORS.online }} />}
              {s.offline > 0 && (
                <div className="w-full rounded-b-md" style={{ height: `${seg(s.offline)}%`, background: MODE_COLORS.offline }} />
              )}
            </div>
            <span className="whitespace-nowrap text-[10px] text-[color:var(--faint)]">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
