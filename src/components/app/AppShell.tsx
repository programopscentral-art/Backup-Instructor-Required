"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  BookOpen,
  Layers,
  LifeBuoy,
  Ticket,
  ReceiptText,
  ShieldCheck,
  ChevronDown,
  Menu,
  X,
  LogOut,
  History,
  CalendarClock,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { signOut } from "@/lib/auth/actions";
import { NotificationBell } from "./NotificationBell";
import { Footer } from "./Footer";
import { Spotlight } from "@/components/ui/Spotlight";
import { themeFor } from "@/lib/theme/role-theme";
import type { AppRole } from "@/lib/auth/roles";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  allow?: AppRole[]; // absent = visible to everyone (admin/hod always see all)
}
interface Group {
  label: string;
  href?: string;
  icon?: LucideIcon;
  items?: Item[];
  adminOnly?: boolean;
  allow?: AppRole[]; // for href groups: restrict who sees it (admin/hod always do)
}

const STAFF = ["university_staff"] as AppRole[];
const CAP = ["capability_manager", "cma"] as AppRole[];
const INSTR = ["instructor"] as AppRole[];

const GROUPS: Group[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Assignments", href: "/dashboard/my-assignments", icon: GraduationCap, allow: INSTR },
  {
    label: "Directories",
    items: [
      { href: "/dashboard/universities", label: "Universities", icon: Building2, allow: STAFF },
      { href: "/dashboard/staff", label: "University Staff", icon: Users, allow: STAFF },
      { href: "/dashboard/instructors", label: "Instructors", icon: GraduationCap, allow: STAFF },
      { href: "/dashboard/subject-sessions", label: "Subject Sessions", icon: CalendarClock, allow: STAFF },
      { href: "/dashboard/subjects", label: "Subjects", icon: BookOpen, allow: [] },
      { href: "/dashboard/capabilities", label: "Capabilities", icon: Layers, allow: CAP },
      { href: "/dashboard/backup-pool", label: "Backup Pool", icon: LifeBuoy, allow: CAP },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/tickets", label: "Tickets", icon: Ticket },
      { href: "/dashboard/invoices", label: "Invoices", icon: ReceiptText, allow: [] },
    ],
  },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, allow: STAFF },
  { label: "Logs", href: "/dashboard/logs", icon: History },
  { label: "Access", href: "/dashboard/access", icon: ShieldCheck, adminOnly: true },
];

export function AppShell({
  user,
  adminLike,
  roles,
  children,
}: {
  user: { name: string; email: string; role: string };
  adminLike: boolean;
  roles: AppRole[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const theme = themeFor(roles);
  const themeVars = {
    "--accent": theme.accent,
    "--accent-2": theme.accent2,
    "--accent-soft": theme.accentSoft,
    "--accent-ink": theme.accentInk,
    "--accent-rgb": theme.rgb,
  } as CSSProperties;

  const itemVisible = (it: Item) => adminLike || !it.allow || it.allow.some((r) => roles.includes(r));
  const groups = GROUPS.filter((g) => !g.adminOnly || adminLike)
    .filter((g) => !g.allow || adminLike || g.allow.some((r) => roles.includes(r)))
    .map((g) => (g.items ? { ...g, items: g.items.filter(itemVisible) } : g))
    .filter((g) => g.href || (g.items && g.items.length > 0));

  useEffect(() => {
    setOpen(null);
    setUserMenu(false);
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null);
        setUserMenu(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function groupActive(g: Group) {
    if (g.href) return pathname === g.href;
    return g.items?.some((i) => pathname.startsWith(i.href)) ?? false;
  }

  return (
    <div className="min-h-screen" style={themeVars}>
      <Spotlight />
      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8" ref={navRef}>
          <div className="flex min-w-0 items-center gap-3 xl:gap-6">
            <Brand />
            {/* Desktop nav */}
            <nav className="hidden items-center gap-0.5 lg:flex xl:gap-1">
              {groups.map((g) => {
                const active = groupActive(g);
                if (g.href) {
                  return (
                    <Link
                      key={g.label}
                      href={g.href}
                      className="relative whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] font-semibold transition-colors xl:px-3.5 xl:text-sm"
                      style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                    >
                      {active && <ActiveBg />}
                      <span className="relative z-10">{g.label}</span>
                    </Link>
                  );
                }
                return (
                  <div key={g.label} className="relative">
                    <button
                      onClick={() => setOpen(open === g.label ? null : g.label)}
                      className="relative flex items-center gap-0.5 whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] font-semibold transition-colors xl:gap-1 xl:px-3.5 xl:text-sm"
                      style={{ color: active || open === g.label ? "var(--accent)" : "var(--muted)" }}
                    >
                      {active && <ActiveBg />}
                      <span className="relative z-10">{g.label}</span>
                      <ChevronDown
                        size={14}
                        className="relative z-10 transition-transform"
                        style={{ transform: open === g.label ? "rotate(180deg)" : "none" }}
                      />
                    </button>
                    <AnimatePresence>
                      {open === g.label && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.98 }}
                          transition={{ duration: 0.16 }}
                          className="absolute left-0 top-full mt-2 w-60 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white p-1.5 shadow-[var(--shadow)]"
                        >
                          {g.items!.map((it) => {
                            const Icon = it.icon;
                            const iActive = pathname.startsWith(it.href);
                            return it.soon ? (
                              <div
                                key={it.href}
                                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[color:var(--faint)]"
                              >
                                <Icon size={16} />
                                {it.label}
                                <span className="pill pill-muted ml-auto !text-[9px]">Soon</span>
                              </div>
                            ) : (
                              <Link
                                key={it.href}
                                href={it.href}
                                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--cream-2)]"
                                style={{ color: iActive ? "var(--accent)" : "var(--ink)" }}
                              >
                                <Icon size={16} style={{ color: iActive ? "var(--accent)" : "var(--muted)" }} />
                                {it.label}
                              </Link>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Right: user */}
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell />
            <div className="relative hidden sm:block">
              <button
                onClick={() => setUserMenu(!userMenu)}
                className="flex items-center gap-2.5 rounded-full border border-[color:var(--line-2)] bg-white py-1.5 pl-1.5 pr-3 transition-colors hover:border-[color:var(--accent)]"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--accent)] text-sm font-bold text-white">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </span>
                <span className="text-left leading-tight">
                  <span className="block max-w-[120px] truncate text-[13px] font-semibold text-[color:var(--ink)]">
                    {user.name}
                  </span>
                  <span className="block text-[10px] text-[color:var(--faint)]">{user.role}</span>
                </span>
                <ChevronDown size={14} className="text-[color:var(--faint)]" />
              </button>
              <AnimatePresence>
                {userMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white p-1.5 shadow-[var(--shadow)]"
                  >
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold">{user.name}</p>
                      <p className="truncate text-xs text-[color:var(--faint)]">{user.email}</p>
                    </div>
                    <div className="my-1 hairline" />
                    <form action={signOut}>
                      <button className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[color:var(--rose)] transition-colors hover:bg-[color:var(--cream-2)]">
                        <LogOut size={16} /> Sign out
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile toggle */}
            <button onClick={() => setMobile(true)} className="btn btn-ghost btn-sm lg:hidden">
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Mobile drawer ---------- */}
      <AnimatePresence>
        {mobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobile(false)}
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-white px-4 py-5 shadow-2xl lg:hidden"
            >
              <div className="mb-4 flex items-center justify-between">
                <Brand />
                <button onClick={() => setMobile(false)} className="btn btn-ghost btn-sm">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {groups.map((g) => (
                  <div key={g.label} className="mb-4">
                    <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--faint)]">
                      {g.label}
                    </p>
                    {g.href ? (
                      <Link href={g.href} className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-[color:var(--cream-2)]">
                        {g.label}
                      </Link>
                    ) : (
                      g.items!.map((it) =>
                        it.soon ? (
                          <div key={it.href} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[color:var(--faint)]">
                            {it.label} <span className="pill pill-muted ml-auto !text-[9px]">Soon</span>
                          </div>
                        ) : (
                          <Link key={it.href} href={it.href} className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-[color:var(--cream-2)]">
                            {it.label}
                          </Link>
                        ),
                      )
                    )}
                  </div>
                ))}
              </div>
              <div className="glass-2 flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-[11px] text-[color:var(--faint)]">{user.role}</p>
                </div>
                <form action={signOut}>
                  <button className="grid h-8 w-8 place-items-center rounded-lg text-[color:var(--rose)] hover:bg-[color:var(--cream-2)]">
                    <LogOut size={16} />
                  </button>
                </form>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
      <Footer />
    </div>
  );
}

function ActiveBg() {
  return (
    <motion.span
      layoutId="nav-active"
      className="absolute inset-0 rounded-full"
      style={{ background: "var(--accent-soft)" }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
    />
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 transition-transform hover:scale-[1.01]">
      <Image
        src="/niat-logo.png"
        alt="NIAT — NxtWave of Innovation in Advanced Technologies"
        width={148}
        height={35}
        priority
        className="h-9 w-[148px] shrink-0"
      />
      {/* Wordmark only where the nav is hidden (mobile/tablet) — on desktop the
          logo alone brands it and the nav needs every pixel. */}
      <span className="flex items-center gap-2 sm:gap-2.5 lg:hidden">
        <span className="h-5 w-px bg-[color:var(--line-2)] sm:h-6" />
        <span className="whitespace-nowrap font-[family-name:var(--font-display)] text-[13px] font-bold text-[color:var(--accent)] sm:text-sm">
          Backup OS
        </span>
      </span>
    </Link>
  );
}
