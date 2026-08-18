import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";

export default async function SubjectSessionsPage() {
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
    .from("subject_sessions")
    .select("id, subject_id, title, instructor_name, schedule, notes, status")
    .order("created_at", { ascending: false });

  const columns: Column[] = [
    { key: "title", label: "Session", required: true, placeholder: "e.g. DSA Lab — Batch A" },
    { key: "subject_id", label: "Subject", type: "select", options: refs.subjects.options },
    { key: "instructor_name", label: "Instructor" },
    { key: "schedule", label: "Schedule", placeholder: "e.g. Mon & Wed · 10:00–11:30" },
    { key: "notes", label: "Notes" },
    { key: "status", label: "Status", type: "select", pill: true, options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ] },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Subject Sessions"
        subtitle="Optional — record the teaching subject sessions running at your university."
      />
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="subject_sessions"
          columns={columns}
          initial={(data ?? []) as Row[]}
          canWrite={canWrite}
          defaults={defaults}
          labelMaps={{ subject_id: refs.subjects.map }}
          searchKeys={["title", "instructor_name", "schedule"]}
        />
      </FadeIn>
    </div>
  );
}
