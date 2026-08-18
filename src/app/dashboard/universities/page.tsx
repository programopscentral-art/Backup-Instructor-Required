import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

const COLUMNS: Column[] = [
  { key: "code", label: "Code", placeholder: "MH002", pill: true },
  { key: "name", label: "University Name", required: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  {
    key: "status",
    label: "Status",
    type: "select",
    pill: true,
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
];

export default async function UniversitiesPage() {
  const ctx = await getSessionContext();
  const canWrite = isAdminLike(ctx?.roles ?? []);
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("universities")
    .select("id, code, name, city, state, status")
    .order("name");

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Universities"
        subtitle="The master list every directory links to. Fully dynamic — new colleges are added here."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="universities"
          columns={COLUMNS}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          defaults={{ status: "active" }}
          searchKeys={["code", "name", "city", "state"]}
        />
      </FadeIn>
    </div>
  );
}
