import { redirect } from "next/navigation";
import { Ticket, FolderOpen, CheckCircle2, MapPin, AlertTriangle } from "lucide-react";
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
  status: TicketStatus;
  mode: TicketMode;
  reason_category: string | null;
  university_id: string | null;
  created_at: string;
  red_flag: boolean | null;
  universities: { name: string } | null;
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
    .select("status, mode, reason_category, university_id, created_at, red_flag, universities(name)");
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

  // Time series (chronological)
  const tsMap = new Map<string, { label: string; count: number }>();
  for (const r of rows) {
    const b = bucketOf(r.created_at, granularity);
    const cur = tsMap.get(b.key);
    if (cur) cur.count += 1;
    else tsMap.set(b.key, { label: b.label, count: 1 });
  }
  const series = [...tsMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-24)
    .map(([, v]) => v);

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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Total tickets" value={total} icon={<Ticket size={20} />} accent="accent" />
          <StatCard label="Open" value={open} icon={<FolderOpen size={20} />} accent="blue" />
          <StatCard label="Closed" value={closed} icon={<CheckCircle2 size={20} />} accent="emerald" />
          <StatCard label="Offline" value={offline} icon={<MapPin size={20} />} accent="violet" hint={`${online} online`} />
          <StatCard label="Red flags" value={redFlags} icon={<AlertTriangle size={20} />} accent="rose" />
        </div>
      </FadeIn>

      {/* Time series */}
      <FadeIn delay={0.1} className="mt-6">
        <div className="card p-6">
          <h2 className="mb-1 font-[family-name:var(--font-display)] text-base font-bold">
            Tickets over time
          </h2>
          <p className="mb-5 text-xs text-[color:var(--muted)]">Raised per {granularity}</p>
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
      </div>

      {/* University breakdown — admin only */}
      {adminLike && (
        <FadeIn delay={0.25} className="mt-6">
          <div className="card p-6">
            <h2 className="mb-5 font-[family-name:var(--font-display)] text-base font-bold">
              By university {university && <span className="pill pill-muted">filtered</span>}
            </h2>
            <BarList items={uniItems} total={total} />
          </div>
        </FadeIn>
      )}
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

/** Vertical time-series bars. */
function TimeBars({ series }: { series: { label: string; count: number }[] }) {
  if (series.length === 0) return <p className="text-sm text-[color:var(--faint)]">No data for this range.</p>;
  const max = Math.max(...series.map((s) => s.count), 1);
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1" style={{ height: 200 }}>
      {series.map((s, i) => (
        <div key={i} className="flex min-w-[28px] flex-1 flex-col items-center gap-1.5">
          <span className="text-xs font-semibold text-[color:var(--ink)]">{s.count}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height: `${(s.count / max) * 100}%`, minHeight: 4, background: "var(--accent)" }}
              title={`${s.label}: ${s.count}`}
            />
          </div>
          <span className="whitespace-nowrap text-[10px] text-[color:var(--faint)]">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
