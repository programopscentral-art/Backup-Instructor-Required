import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

export default async function SubjectsPage() {
  const ctx = await getSessionContext();
  const canWrite = isAdminLike(ctx?.roles ?? []);
  const refs = await getRefs();
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("subjects")
    .select("id, name, normalized_name, capability_id, status")
    .order("name");

  const columns: Column[] = [
    { key: "name", label: "Subject (display)", required: true },
    { key: "normalized_name", label: "Normalized key", required: true, placeholder: "dsa" },
    { key: "capability_id", label: "Capability", type: "select", options: refs.capabilities.options },
    { key: "status", label: "Status", type: "select", pill: true, options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ] },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Subjects"
        subtitle="Messy sheet labels normalize to one routing key, each mapped to the capability that owns it."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="subjects"
          columns={columns}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          defaults={{ status: "active" }}
          labelMaps={{ capability_id: refs.capabilities.map }}
          searchKeys={["name", "normalized_name"]}
        />
      </FadeIn>
    </div>
  );
}
