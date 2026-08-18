import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Users,
  GraduationCap,
  LifeBuoy,
  Layers,
  BookOpen,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { isAdminLike, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { createAuthedClient } from "@/lib/supabase/server";
import type { CSSProperties } from "react";
import { themeFor } from "@/lib/theme/role-theme";
import { StatCard } from "@/components/ui/StatCard";
import { Stagger, StaggerItem, FadeIn } from "@/components/ui/motion";

async function count(table: string) {
  // createAuthedClient is request-cached, so all six counts share one client
  // and one auth validation instead of six separate round-trips.
  const supabase = await createAuthedClient();
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

export default async function DashboardHome() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const [universities, staff, instructors, pool, capabilities, subjects] = await Promise.all([
    count("universities"),
    count("university_staff"),
    count("instructors"),
    count("backup_instructor_pool"),
    count("capabilities"),
    count("subjects"),
  ]);

  const adminLike = isAdminLike(ctx.roles);
  const STAFF: AppRole[] = ["university_staff"];
  const CAP: AppRole[] = ["capability_manager", "cma"];
  const allStats = [
    { label: "Universities", value: universities, icon: <Building2 size={20} />, accent: "accent", href: "/dashboard/universities", allow: STAFF },
    { label: "University Staff", value: staff, icon: <Users size={20} />, accent: "blue", href: "/dashboard/staff", allow: STAFF },
    { label: "Instructors", value: instructors, icon: <GraduationCap size={20} />, accent: "violet", href: "/dashboard/instructors", allow: STAFF },
    { label: "Backup Pool", value: pool, icon: <LifeBuoy size={20} />, accent: "emerald", href: "/dashboard/backup-pool", allow: CAP },
    { label: "Capabilities", value: capabilities, icon: <Layers size={20} />, accent: "amber", href: "/dashboard/capabilities", allow: CAP },
    { label: "Subjects", value: subjects, icon: <BookOpen size={20} />, accent: "rose", href: "/dashboard/subjects", allow: [] as AppRole[] },
  ];
  const stats = allStats.filter(
    (s) => adminLike || !s.allow || s.allow.some((r) => ctx.roles.includes(r)),
  );

  const theme = themeFor(ctx.roles);
  const firstName = ctx.profile?.full_name?.split(" ")[0] || theme.team;

  return (
    <div>
      {/* Role-themed animated hero */}
      <FadeIn className="mb-6">
        <div
          className="mesh-hero hero-sheen relative overflow-hidden rounded-3xl p-7 text-white shadow-[0_24px_60px_-24px_rgba(var(--accent-rgb),0.6)] sm:p-9"
          style={{ ["--grad-from" as string]: theme.gradFrom, ["--grad-to" as string]: theme.gradTo } as CSSProperties}
        >
          <div className="orb" style={{ width: 190, height: 190, background: "rgba(255,255,255,0.28)", top: -60, right: 30 }} />
          <div className="orb" style={{ width: 150, height: 150, background: "rgba(255,255,255,0.16)", bottom: -60, left: "28%", animationDelay: "2.5s" }} />
          <div className="relative z-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur">
              <span className="text-sm">{theme.emoji}</span> {theme.team}
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] text-white/85">{theme.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {ctx.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur"
                >
                  {ROLE_LABELS[r]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </FadeIn>

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {stats.map((s) => (
          <StaggerItem key={s.label}>
            <Link href={s.href} className="block">
              <StatCard label={s.label} value={s.value} icon={s.icon} accent={s.accent} />
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      <FadeIn delay={0.2} className="mt-6">
        <div className="card relative overflow-hidden p-6 sm:p-8">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full blur-3xl"
            style={{ background: "rgba(180,83,9,0.1)" }}
          />
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">
                The backup flow, end to end
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--muted)]">
                University staff raise an absence → it routes to Ops + the subject&apos;s
                Capability Manager → CM proposes a backup and mode → Ops confirms &amp;
                dispatches → instructor delivers → offline claims clear Ops then HOD.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Raised", "CM Review", "Mode", "Assigned", "Confirmed", "Session", "Invoice", "Ops ✓", "HOD ✓"].map(
                  (s, i) => (
                    <span key={s} className="flex items-center gap-2">
                      <span className={`pill ${i >= 6 ? "pill-warn" : i >= 4 ? "pill-good" : "pill-muted"}`}>{s}</span>
                      {i < 8 && <span className="text-[color:var(--faint)]">→</span>}
                    </span>
                  ),
                )}
              </div>
              <Link href="/dashboard/universities" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--accent)] hover:underline">
                Start with the directories <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
