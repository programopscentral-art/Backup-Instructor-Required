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
  const canWrite = isAdminLike(ctx?.roles ?? []);
  const refs = await getRefs();
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("backup_instructor_pool")
    .select("id, instructor_name, emp_id, capability_id, availability_mode, current_status")
    .order("instructor_name");

  const columns: Column[] = [
    { key: "instructor_name", label: "Backup Instructor", required: true },
    { key: "emp_id", label: "Emp ID", pill: true },
    { key: "capability_id", label: "Capability", type: "select", options: refs.capabilities.options },
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
          defaults={{ availability_mode: "both", current_status: "available", status: "active" }}
          labelMaps={{ capability_id: refs.capabilities.map }}
          searchKeys={["instructor_name", "emp_id"]}
        />
      </FadeIn>
    </div>
  );
}
