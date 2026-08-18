import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

const ROLE_OPTIONS = ["BOA", "BOA-1", "BOA-2", "PMA", "PMA 1", "PM", "COS", "CM", "CMA"].map(
  (r) => ({ value: r, label: r }),
);

export default async function StaffPage() {
  const ctx = await getSessionContext();
  const roles = ctx?.roles ?? [];
  const adminLike = isAdminLike(roles);
  // University staff can manage their OWN campus's staff.
  const canWrite = adminLike || roles.includes("university_staff");
  const myUniv =
    ctx?.assignments.find((a) => a.role === "university_staff" && a.scope_type === "university")?.scope_id ?? null;
  const defaults: Record<string, unknown> = { status: "active" };
  if (!adminLike && myUniv) defaults.university_id = myUniv;
  const refs = await getRefs();
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("university_staff")
    .select("id, employee_id, full_name, university_id, personal_contact, office_contact, email, role, status")
    .order("full_name");

  const columns: Column[] = [
    { key: "employee_id", label: "Emp ID", pill: true, placeholder: "NW0000000" },
    { key: "full_name", label: "Name", required: true },
    { key: "university_id", label: "University", type: "select", options: refs.universities.options },
    { key: "role", label: "Role", type: "select", options: ROLE_OPTIONS, pill: true },
    { key: "email", label: "Email" },
    { key: "personal_contact", label: "Phone" },
    { key: "status", label: "Status", type: "select", pill: true, options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ] },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="University Staff"
        subtitle="BOAs, PMAs, PMs and COS across every campus — the people who raise absence tickets."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="university_staff"
          columns={columns}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          defaults={defaults}
          labelMaps={{ university_id: refs.universities.map }}
          searchKeys={["employee_id", "full_name", "email", "role"]}
        />
      </FadeIn>
    </div>
  );
}
