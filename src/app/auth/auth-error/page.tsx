import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { FadeIn } from "@/components/ui/motion";

const REASONS: Record<string, string> = {
  domain:
    "That account isn't an @nxtwave.in or @nxtwave.co.in address. Please sign in with your NxtWave work account.",
  exchange: "We couldn't complete the sign-in. Please try again.",
  nocode: "The sign-in link was incomplete. Please try again.",
  default: "Something went wrong during sign-in. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = REASONS[reason ?? "default"] ?? REASONS.default;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <FadeIn className="w-full max-w-md" y={24}>
        <div className="glass p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-rose-400/12 text-[color:var(--rose)]">
            <ShieldAlert size={26} />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
            Sign-in blocked
          </h1>
          <p className="mt-3 text-sm text-[color:var(--muted)]">{message}</p>
          <Link href="/login" className="btn btn-primary mt-6">
            Back to sign in
          </Link>
        </div>
      </FadeIn>
    </main>
  );
}
