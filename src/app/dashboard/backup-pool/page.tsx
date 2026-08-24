import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

export default async function BackupPoolPage() {
  const ctx = await getSessionContext();
  const roles = ctx?.roles ?? [];
  const adminLike = isAdminLike(roles);

  // Capability-Manager scope: global CMs manage the whole pool; capability-scoped
  // CMs manage only their own capabilities' backups.
  const capAssigns = (ctx?.assignments ?? []).filter(
    (a) => a.role === "capability_manager" || a.role === "cma",
  );
  const globalCM = capAssigns.some((a) => a.scope_type === "global");
  const capIds = capAssigns
    .filter((a) => a.scope_type === "capability" && a.scope_id)
    .map((a) => a.scope_id as string);
  const fullAccess = adminLike || globalCM;
  const canWrite = fullAccess || capIds.length > 0;

  const refs = await getRefs();
  // Scoped CMs can only file backups under their own capabilities.
  const capOptions = fullAccess
    ? refs.capabilities.options
    : refs.capabilities.options.filter((o) => capIds.includes(o.value));
  // Scoped CMs may only edit/delete rows in their capabilities (serializable scope).
  const editScope = fullAccess ? undefined : { key: "capability_id", allow: capIds };

  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("backup_instructor_pool")
    .select("id, instructor_name, emp_id, email, red_flags, capability_id, availability_mode, current_status")
    .order("instructor_name");

  const columns: Column[] = [
    { key: "instructor_name", label: "Backup Instructor", required: true },
    { key: "emp_id", label: "Emp ID", pill: true },
    { key: "email", label: "Email (for login)", placeholder: "name@nxtwave.in" },
    { key: "red_flags", label: "Red flags (set 0 to unlock)", pill: true, placeholder: "0" },
    { key: "capability_id", label: "Capability", type: "select", required: true, options: capOptions },
    { key: "availability_mode", label: "Mode", type: "select", pill: true, options: [
      { value: "online", label: "Online" },
      { value: "offline", label: "Offline" },
      { value: "both", label: "Both" },
    ] },
    { key: "current_status", label: "Status", type: "select", pill: true, options: [
      { value: "available", label: "Available" },
      { value: "assigned", label: "Assigned" },
      { value: "on_leave", label: "On leave" },
    ] },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Backup Pool"
        subtitle="Candidate backups under each capability manager. This is the pool a CM assigns from when a ticket lands."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="backup_instructor_pool"
          columns={columns}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          editScope={editScope}
          defaults={{
            availability_mode: "both",
            current_status: "available",
            status: "active",
            ...(!fullAccess && capIds.length === 1 ? { capability_id: capIds[0] } : {}),
          }}
          labelMaps={{ capability_id: refs.capabilities.map }}
          searchKeys={["instructor_name", "emp_id", "email"]}
        />
      </FadeIn>
    </div>
  );
}
