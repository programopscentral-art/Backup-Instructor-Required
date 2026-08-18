export type AppRole =
  | "admin"
  | "hod"
  | "capability_manager"
  | "cma"
  | "university_staff"
  | "instructor";

export type ScopeKind = "global" | "university" | "capability";
export type ProfileStatus = "pending" | "active" | "inactive";

export interface RoleAssignment {
  role: AppRole;
  scope_type: ScopeKind;
  scope_id: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  status: ProfileStatus;
}

/** Human labels for each role. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin — Program Ops",
  hod: "HOD",
  capability_manager: "Capability Manager",
  cma: "Capability Manager Assistant",
  university_staff: "University Staff",
  instructor: "Instructor",
};

/**
 * Priority order when a user holds multiple roles. The highest-priority role
 * decides which dashboard is shown first (a switcher can expose the rest).
 */
export const ROLE_PRIORITY: AppRole[] = [
  "admin",
  "hod",
  "capability_manager",
  "cma",
  "university_staff",
  "instructor",
];

export function primaryRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return null;
}

export function isAdminLike(roles: AppRole[]): boolean {
  return roles.includes("admin") || roles.includes("hod");
}

/** Allowed login domains, sourced from env. */
export function allowedDomains(): string[] {
  return (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "nxtwave.in,nxtwave.co.in")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isDomainAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && allowedDomains().includes(domain);
}
