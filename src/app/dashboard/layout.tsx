import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { isAdminLike, primaryRole, ROLE_LABELS } from "@/lib/auth/roles";
import { AppShell } from "@/components/app/AppShell";

// Live ops tool — every dashboard page reads fresh data (no static/data cache).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.profile || ctx.profile.status !== "active" || ctx.roles.length === 0) {
    redirect("/pending");
  }

  const role = primaryRole(ctx.roles)!;

  return (
    <AppShell
      adminLike={isAdminLike(ctx.roles)}
      roles={ctx.roles}
      user={{
        name: ctx.profile.full_name || ctx.email,
        email: ctx.email,
        role: ROLE_LABELS[role],
      }}
    >
      {children}
    </AppShell>
  );
}
