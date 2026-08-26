import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

const PLATFORM: [string, string][] = [
  ["Dashboard", "/dashboard"],
  ["Tickets", "/dashboard/tickets"],
  ["My Assignments", "/dashboard/my-assignments"],
  ["Analytics", "/dashboard/analytics"],
];
const OPS: [string, string][] = [
  ["Invoices", "/dashboard/invoices"],
  ["HOD Approvals", "/dashboard/hod-approvals"],
  ["Backup Pool", "/dashboard/backup-pool"],
  ["Logs", "/dashboard/logs"],
];

export function Footer() {
  const year = new Date().getFullYear();
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
            {/* Brand */}
            <div>
              <div className="inline-flex items-center rounded-2xl bg-white p-3 shadow-lg">
                <Image
                  src="/niat-logo.png"
                  alt="NIAT — NxtWave of Innovation in Advanced Technologies"
                  width={230}
                  height={54}
                  className="h-12 w-auto"
                />
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
                Backup OS · Program Ops
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
                Arranging backup instructors across 40+ campuses — raised, allocated, delivered, and settled with full accountability.
              </p>
            </div>

            {/* Platform links */}
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white/50">Platform</p>
              <ul className="space-y-2.5">
                {PLATFORM.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
                    >
                      {label}
                      <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Operations links */}
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white/50">Operations</p>
              <ul className="space-y-2.5">
                {OPS.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="group inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
                    >
                      {label}
                      <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 sm:flex-row">
            <p className="text-xs text-white/60">
              © {year} NIAT · NxtWave Institute of Advanced Technologies. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} /> Secure · role-based
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Program Ops · Live
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
