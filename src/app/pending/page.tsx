import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { SignOutButton } from "@/components/sign-out-button";
import { RecheckAccessButton } from "./recheck-button";
import { FadeIn } from "@/components/ui/motion";

export default async function PendingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (ctx.profile?.status === "active" && ctx.roles.length > 0) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <FadeIn className="w-full max-w-md" y={24}>
        <div className="glass p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/12 text-[color:var(--amber)]">
            <Clock size={26} />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
            Access pending
          </h1>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            You&apos;re signed in as{" "}
            <span className="text-[color:var(--ink)]">{ctx.email}</span>, but no role
            has been assigned yet. An Admin from Program Ops needs to grant you access.
          </p>
          <p className="mt-2 text-sm text-[color:var(--faint)]">
            Already added to a directory (staff, instructor, capability, or backup pool)?
            Click below to pull in your access instantly.
          </p>
          <div className="mt-6 space-y-3">
            <RecheckAccessButton />
            <div className="flex justify-center">
              <SignOutButton />
            </div>
          </div>
        </div>
      </FadeIn>
    </main>
  );
}
