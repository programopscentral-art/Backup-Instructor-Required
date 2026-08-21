import { redirect } from "next/navigation";
import { Ticket, FolderOpen, CheckCircle2, MapPin, AlertTriangle, Timer, UserCog } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FadeIn } from "@/components/ui/motion";
import { STATUS_META, MODE_LABEL, type TicketStatus, type TicketMode } from "@/lib/tickets/status";
import { AnalyticsFilters } from "./filters";

export const dynamic = "force-dynamic";

type Gran = "day" | "week" | "month" | "year";
const GRANS: Gran[] = ["day", "week", "month", "year"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Bucket a timestamp into a {key,label} for the chosen granularity. */
function bucketOf(iso: string, gran: Gran): { key: string; label: string } {
  const d = new Date(iso);
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
  status: TicketStatus;
  mode: TicketMode;
  reason_category: string | null;
  university_id: string | null;
  created_at: string;
  red_flag: boolean | null;
  universities: { name: string } | null;
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
    .select("id, status, mode, reason_category, university_id, created_at, red_flag, universities(name), capabilities(name, manager_name)");
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);
  if (university) query = query.eq("university_id", university);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  // ---- Aggregate ----
  const total = rows.length;
  const closed = rows.filter((r) => r.status === "closed").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const open = total - closed - cancelled;
  const offline = rows.filter((r) => r.mode === "offline").length;
  const online = rows.filter((r) => r.mode === "online").length;
  const redFlags = rows.filter((r) => r.red_flag === true).length;

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
  let avgDaysToClose = 0;
  let closedMeasured = 0;
  if (closedIds.length) {
    const { data: evs } = await supabase
      .from("ticket_events")
      .select("ticket_id, created_at")
      .eq("to_status", "closed")
      .in("ticket_id", closedIds);
    const closedAt = new Map<string, string>();
    for (const e of (evs ?? []) as { ticket_id: string; created_at: string }[]) {
      const cur = closedAt.get(e.ticket_id);
      if (!cur || e.created_at < cur) closedAt.set(e.ticket_id, e.created_at);
    }
    let totalDays = 0;
    for (const r of rows) {
      if (r.status !== "closed") continue;
      const ca = closedAt.get(r.id);
      if (!ca) continue;
      const days = (new Date(ca).getTime() - new Date(r.created_at).getTime()) / 86_400_000;
      if (days >= 0) {
        totalDays += days;
        closedMeasured += 1;
      }
    }
    avgDaysToClose = closedMeasured ? totalDays / closedMeasured : 0;
  }

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
  const avgCloseLabel =
    closedMeasured > 0
      ? avgDaysToClose >= 1
        ? `${avgDaysToClose.toFixed(1)}d`
        : `${Math.round(avgDaysToClose * 24)}h`
      : "—";

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

      {/* KPIs */}
      <FadeIn delay={0.05}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Total tickets" value={total} icon={<Ticket size={20} />} accent="accent" />
          <StatCard label="Open" value={open} icon={<FolderOpen size={20} />} accent="blue" />
          <StatCard label="Closed" value={closed} icon={<CheckCircle2 size={20} />} accent="emerald" />
          <StatCard label="Offline" value={offline} icon={<MapPin size={20} />} accent="violet" hint={`${online} online`} />
          <StatCard label="Red flags" value={redFlags} icon={<AlertTriangle size={20} />} accent="rose" />
          <MetricCard
            label="Avg time to close"
            value={avgCloseLabel}
            hint={closedMeasured > 0 ? `${closedMeasured} closed` : undefined}
          />
        </div>
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

/** StatCard variant that shows a text value (e.g. "2.5d"). */
function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const rgb = "180,83,9";
  return (
    <div className="card card-hover relative overflow-hidden p-5" style={{ ["--rgb" as string]: rgb }}>
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl"
        style={{ background: `rgba(${rgb},0.18)` }}
      />
      <div className="flex items-start justify-between">
        <div
          className="grid h-11 w-11 place-items-center rounded-xl"
          style={{ background: `rgba(${rgb},0.14)`, color: `rgb(${rgb})` }}
        >
          <Timer size={20} />
        </div>
        {hint && <span className="pill pill-muted">{hint}</span>}
      </div>
      <div className="mt-4">
        <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          {value}
        </div>
        <div className="mt-1 text-sm text-[color:var(--muted)]">{label}</div>
      </div>
    </div>
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
