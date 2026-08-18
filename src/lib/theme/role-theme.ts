import { ROLE_PRIORITY, type AppRole } from "@/lib/auth/roles";

export interface RoleTheme {
  key: AppRole;
  team: string;
  tagline: string;
  emoji: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  accentInk: string;
  gradFrom: string;
  gradTo: string;
  rgb: string; // "r,g,b" of accent, for glows
}

/** Each role/team gets a signature palette that re-themes the whole app. */
export const ROLE_THEME: Record<AppRole, RoleTheme> = {
  admin: {
    key: "admin",
    team: "Program Ops",
    tagline: "Full command — directories, roles, and every backup assignment.",
    emoji: "🛡️",
    accent: "#991b1b",
    accent2: "#dc2626",
    accentSoft: "#fdeceb",
    accentInk: "#7f1d1d",
    gradFrom: "#991b1b",
    gradTo: "#b45309",
    rgb: "153,27,27",
  },
  hod: {
    key: "hod",
    team: "Department Head",
    tagline: "The final word — approvals, oversight, and sign-off.",
    emoji: "👑",
    accent: "#b45309",
    accent2: "#d97706",
    accentSoft: "#fff4e2",
    accentInk: "#92400e",
    gradFrom: "#b45309",
    gradTo: "#a16207",
    rgb: "180,83,9",
  },
  capability_manager: {
    key: "capability_manager",
    team: "Capability Studio",
    tagline: "Your vertical, your pool — assign the right backup, fast.",
    emoji: "🧩",
    accent: "#4f46e5",
    accent2: "#7c3aed",
    accentSoft: "#eef0fe",
    accentInk: "#3730a3",
    gradFrom: "#4f46e5",
    gradTo: "#7c3aed",
    rgb: "79,70,229",
  },
  cma: {
    key: "cma",
    team: "Capability Studio",
    tagline: "Backing up the vertical — pool, tickets, and coordination.",
    emoji: "🧩",
    accent: "#6d28d9",
    accent2: "#8b5cf6",
    accentSoft: "#f1ebfd",
    accentInk: "#5b21b6",
    gradFrom: "#6d28d9",
    gradTo: "#4f46e5",
    rgb: "109,40,217",
  },
  university_staff: {
    key: "university_staff",
    team: "Campus Desk",
    tagline: "Your campus, your people — raise, track, and manage.",
    emoji: "🏫",
    accent: "#0f766e",
    accent2: "#0891b2",
    accentSoft: "#e6f5f2",
    accentInk: "#115e59",
    gradFrom: "#0f766e",
    gradTo: "#0891b2",
    rgb: "15,118,110",
  },
  instructor: {
    key: "instructor",
    team: "Instructor",
    tagline: "Your assignments and claims — clean and on time.",
    emoji: "🎓",
    accent: "#047857",
    accent2: "#059669",
    accentSoft: "#e7f6ef",
    accentInk: "#065f46",
    gradFrom: "#047857",
    gradTo: "#0d9488",
    rgb: "4,120,87",
  },
};

export function themeFor(roles: AppRole[]): RoleTheme {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return ROLE_THEME[r];
  return ROLE_THEME.admin;
}
