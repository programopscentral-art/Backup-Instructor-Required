import Image from "next/image";
import type { CSSProperties } from "react";
import { SignInButton } from "./sign-in-button";
import { FadeIn } from "@/components/ui/motion";

const FEATURES = [
  "Auto role-routing by email",
  "Realtime across every campus",
  "Ops → HOD approvals, tracked",
];

function Check() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="relative min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ============ LEFT — animated brand panel ============ */}
      <section
        className="mesh-hero hero-sheen relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ ["--grad-from" as string]: "#7A0016", ["--grad-to" as string]: "#37000a" } as CSSProperties}
      >
        <div className="orb" style={{ width: 260, height: 260, background: "rgba(255,255,255,0.10)", top: -80, right: -40 }} />
        <div className="orb" style={{ width: 200, height: 200, background: "rgba(255,255,255,0.07)", bottom: 40, left: -60, animationDelay: "2s" }} />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-4 select-none font-[family-name:var(--font-display)] font-black leading-none text-white/[0.06]"
          style={{ fontSize: "16vw" }}
        >
          NIAT
        </span>

        {/* top: logo */}
        <FadeIn className="relative z-10">
          <span className="inline-flex items-center rounded-2xl bg-white p-3 shadow-xl">
            <Image src="/niat-logo.png" alt="NIAT — NxtWave of Innovation in Advanced Technologies" width={220} height={52} priority className="h-11 w-auto" />
          </span>
        </FadeIn>

        {/* middle: headline + features */}
        <div className="relative z-10">
          <FadeIn delay={0.05}>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/70">NIAT · Program Ops</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-6xl font-black leading-[0.95] tracking-tight">
              Backup <span className="text-white/60">OS</span>
            </h1>
            <p className="mt-4 max-w-md font-[family-name:var(--font-display)] text-lg font-bold">
              <span className="animate-pulse bg-gradient-to-r from-white via-amber-100 to-white/50 bg-clip-text text-transparent">
                NxtWave of Innovation in Advanced Technologies
              </span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65">
              Arrange, deliver, and settle backup instructors across 40+ campuses — one accountable flow.
            </p>
          </FadeIn>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((f, i) => (
              <FadeIn key={f} delay={0.15 + i * 0.08} className="flex items-center gap-3 text-sm text-white/85">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-white backdrop-blur">
                  <Check />
                </span>
                {f}
              </FadeIn>
            ))}
          </ul>
        </div>

        {/* bottom */}
        <div className="relative z-10 flex items-center gap-2 text-xs text-white/55">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Secure · role-based · © {new Date().getFullYear()} NIAT
        </div>
      </section>

      {/* ============ RIGHT — sign in ============ */}
      <section className="relative flex items-center justify-center px-4 py-12">
        <FadeIn className="w-full max-w-sm" y={22}>
          <div className="glass p-8 sm:p-10">
            {/* logo — shield on mobile, compact everywhere */}
            <div className="mb-7 text-center">
              <FadeIn delay={0.05}>
                <span className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-brand)] ring-1 ring-[color:var(--line)]">
                  <Image src="/icon.png" alt="NIAT" width={44} height={44} className="h-11 w-11" />
                </span>
              </FadeIn>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                NIAT · Program Ops
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[color:var(--ink)]">
                Welcome to <span className="gradient-text">Backup OS</span>
              </h2>
              <p className="mx-auto mt-3 max-w-xs text-sm text-[color:var(--muted)]">
                Sign in with your{" "}
                <span className="font-semibold text-[color:var(--ink)]">@nxtwave.in</span> or{" "}
                <span className="font-semibold text-[color:var(--ink)]">@nxtwave.co.in</span> account.
              </p>
            </div>

            <SignInButton />

            {/* features — shown on mobile (left panel is hidden there) */}
            <div className="lg:hidden">
              <div className="my-7 hairline" />
              <div className="flex flex-col gap-2.5">
                {FEATURES.map((f, i) => (
                  <FadeIn key={f} delay={0.15 + i * 0.07} className="flex items-center gap-2.5 text-sm text-[color:var(--muted)]">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                      <Check />
                    </span>
                    {f}
                  </FadeIn>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-[color:var(--faint)]">
            New here? You&apos;ll be guided to request access after sign-in.
          </p>
        </FadeIn>
      </section>
    </main>
  );
}
