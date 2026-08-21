import { SignInButton } from "./sign-in-button";
import { FadeIn } from "@/components/ui/motion";

const FEATURES = [
  "Auto role-routing by email",
  "Realtime everywhere",
  "Ops → HOD approvals",
];

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <FadeIn className="w-full max-w-md" y={24}>
        <div className="glass p-8 sm:p-10">
          <div className="mb-8 text-center">
            <FadeIn delay={0.05}>
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--accent)] shadow-[var(--shadow-brand)]">
                <span className="font-[family-name:var(--font-display)] text-2xl font-black text-white">
                  N
                </span>
              </div>
            </FadeIn>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[color:var(--accent)]">
              NIAT · Program Ops
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[color:var(--ink)]">
              Backup
              <br />
              <span className="gradient-text">OS</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-[color:var(--muted)]">
              Sign in with your{" "}
              <span className="font-semibold text-[color:var(--ink)]">@nxtwave.in</span> or{" "}
              <span className="font-semibold text-[color:var(--ink)]">@nxtwave.co.in</span> account.
            </p>
          </div>

          <SignInButton />

          <div className="my-7 hairline" />

          <div className="flex flex-col gap-2.5">
            {FEATURES.map((f, i) => (
              <FadeIn
                key={f}
                delay={0.15 + i * 0.07}
                className="flex items-center gap-2.5 text-sm text-[color:var(--muted)]"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {f}
              </FadeIn>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[color:var(--faint)]">
          New here? You&apos;ll be guided to request access after sign-in.
        </p>
      </FadeIn>
    </main>
  );
}
