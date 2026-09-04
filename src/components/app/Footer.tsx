import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { isAdminLike, type AppRole } from "@/lib/auth/roles";

interface FLink {
  label: string;
  href: string;
  allow?: AppRole[]; // undefined = everyone; [] = admin/HOD only (mirrors the nav)
}

const STAFF: AppRole[] = ["university_staff"];
const CAP: AppRole[] = ["capability_manager", "cma"];
const INSTR: AppRole[] = ["instructor"];

// Same access rules as the top nav (AppShell) so the footer never links a role
// to a page it can't use.
const PLATFORM: FLink[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Tickets", href: "/dashboard/tickets" },
  { label: "My Assignments", href: "/dashboard/my-assignments", allow: [...INSTR, ...STAFF, ...CAP] },
  { label: "Analytics", href: "/dashboard/analytics", allow: STAFF },
];
const OPS: FLink[] = [
  { label: "Invoices", href: "/dashboard/invoices", allow: [] },
  { label: "HOD Approvals", href: "/dashboard/hod-approvals", allow: [] },
  { label: "Backup Pool", href: "/dashboard/backup-pool", allow: CAP },
  { label: "Logs", href: "/dashboard/logs" },
];

function LinkList({ title, links }: { title: string; links: FLink[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white/50">{title}</p>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="group inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
            >
              {l.label}
              <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({ roles = [], team }: { roles?: AppRole[]; team?: string }) {
  const year = new Date().getFullYear();
  const adminLike = isAdminLike(roles);
  const canSee = (l: FLink) => adminLike || !l.allow || l.allow.some((r) => roles.includes(r));
  const platform = PLATFORM.filter(canSee);
  const ops = OPS.filter(canSee);
  const teamLabel = team || "Program Ops";

  return (
    <footer className="relative mt-20">
      {/* glowing gradient hairline */}
      <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[color:var(--accent)] to-transparent opacity-70" />

      <div
        className="mesh-hero hero-sheen relative overflow-hidden text-white"
        style={{ ["--grad-from" as string]: "#7A0016", ["--grad-to" as string]: "#37000a" } as CSSProperties}
      >
        {/* floating orbs */}
        <div className="orb" style={{ width: 220, height: 220, background: "rgba(255,255,255,0.10)", top: -80, right: 60 }} />
        <div className="orb" style={{ width: 160, height: 160, background: "rgba(255,255,255,0.07)", bottom: -60, left: "30%", animationDelay: "2s" }} />

        {/* giant watermark */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-8 right-2 select-none font-[family-name:var(--font-display)] font-black leading-none text-white/[0.06]"
          style={{ fontSize: "22vw" }}
        >
          NIAT
        </span>

        <div className="relative z-10 mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
            {/* Brand — bg-[#ffffff] (not the bg-white utility) so it stays white in dark mode */}
            <div>
              <div className="inline-flex items-center rounded-2xl bg-[#ffffff] p-3 shadow-lg">
                <Image
                  src="/niat-logo.png"
                  alt="NIAT — NxtWave of Innovation in Advanced Technologies"
                  width={230}
                  height={54}
                  className="h-12 w-auto"
                />
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                Backup OS · {teamLabel}
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
                Arranging backup instructors across 40+ campuses — raised, allocated, delivered, and settled with full accountability.
              </p>
            </div>

            {/* Role-filtered link columns */}
            <LinkList title="Platform" links={platform} />
            <LinkList title="Operations" links={ops} />
          </div>

          {/* bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 sm:flex-row">
            <p className="text-xs text-white/60">
              © {year} NIAT · NxtWave of Innovation in Advanced Technologies. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} /> Secure · role-based
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {teamLabel} · Live
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
