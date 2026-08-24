import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

export default async function InstructorsPage() {
  const ctx = await getSessionContext();
  const roles = ctx?.roles ?? [];
  const adminLike = isAdminLike(roles);
  const canWrite = adminLike || roles.includes("university_staff");
  const myUniv =
    ctx?.assignments.find((a) => a.role === "university_staff" && a.scope_type === "university")?.scope_id ?? null;
  const defaults: Record<string, unknown> = { status: "active" };
  if (!adminLike && myUniv) defaults.university_id = myUniv;
  const refs = await getRefs();
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("instructors")
    .select("id, university_id, subject_id, instructor_name, emp_id, email, instructor_type, deployment_status, status")
    .order("instructor_name");

  const columns: Column[] = [
    { key: "instructor_name", label: "Instructor", required: true },
    { key: "emp_id", label: "Emp ID", pill: true },
    { key: "email", label: "Email (for login)", placeholder: "name@nxtwave.in" },
    { key: "university_id", label: "University", type: "select", options: refs.universities.options },
    { key: "subject_id", label: "Subject", type: "select", options: refs.subjects.options },
    { key: "instructor_type", label: "Type", type: "select", pill: true, options: [
      { value: "Old", label: "Old" },
      { value: "New", label: "New" },
    ] },
    { key: "deployment_status", label: "Deployment", type: "select", pill: true, options: [
      { value: "Deployed", label: "Deployed" },
      { value: "Yet to be Deployed", label: "Yet to be Deployed" },
    ] },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Instructors"
        subtitle="University- and subject-wise instructors. Type and deployment status drive backup planning."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="instructors"
          columns={columns}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          defaults={defaults}
          labelMaps={{ university_id: refs.universities.map, subject_id: refs.subjects.map }}
          searchKeys={["instructor_name", "emp_id", "email"]}
        />
      </FadeIn>
    </div>
  );
}
