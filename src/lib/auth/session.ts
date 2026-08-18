import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile, RoleAssignment } from "./roles";

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile | null;
  roles: AppRole[];
  assignments: RoleAssignment[];
}

/**
 * Loads the current user's profile + role assignments in one place.
 * Returns null when there is no authenticated user.
 *
 * cache()'d so the layout AND the page in one navigation share a single call
 * (one getUser + one profile/roles query) instead of each re-doing the work.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("role_assignments")
      .select("role, scope_type, scope_id")
      .eq("user_id", user.id),
  ]);

  const rows = (assignments ?? []) as RoleAssignment[];

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: (profile as Profile | null) ?? null,
    roles: rows.map((r) => r.role),
    assignments: rows,
  };
});
