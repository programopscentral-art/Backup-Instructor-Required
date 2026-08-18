import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

const COLUMNS: Column[] = [
  { key: "name", label: "Capability (subject vertical)", required: true },
  { key: "manager_name", label: "Capability Manager" },
  { key: "status", label: "Status", type: "select", pill: true, options: [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ] },
];

export default async function CapabilitiesPage() {
  const ctx = await getSessionContext();
  const canWrite = isAdminLike(ctx?.roles ?? []);
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("capabilities")
    .select("id, name, manager_name, status")
    .order("name");

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Capabilities"
        subtitle="Subject verticals and the manager who owns each backup pool. Adding one here unblocks tickets for that subject."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="capabilities"
          columns={COLUMNS}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          defaults={{ status: "active" }}
          searchKeys={["name", "manager_name"]}
        />
      </FadeIn>
    </div>
  );
}
