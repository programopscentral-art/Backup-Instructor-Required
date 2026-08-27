import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";
import { getRefs } from "@/lib/directory/refs";
import { DirectoryTable, type Column } from "@/components/directory/DirectoryTable";
import type { Row } from "@/lib/directory/useRealtimeTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { FadeIn } from "@/components/ui/motion";
import { NewCapability } from "./new-capability";

export const dynamic = "force-dynamic";

export default async function CapabilityManagersPage() {
  const ctx = await getSessionContext();
  const adminLike = isAdminLike(ctx?.roles ?? []);

  const refs = await getRefs();
  const supabase = await createAuthedClient();
  const { data } = await supabase
    .from("capability_managers")
    .select("id, capability_id, name, email, status")
    .order("name");

  const columns: Column[] = [
    { key: "name", label: "Capability Manager", required: true },
    { key: "email", label: "Email (login + notify)", required: true, placeholder: "name@nxtwave.co.in" },
    {
      key: "capability_id",
      label: "Capability (subject vertical)",
      type: "select",
      required: true,
      options: refs.capabilities.options,
    },
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

  return (
    <div>
      <PageHeader
        eyebrow="Directory"
        title="Capability Managers"
        subtitle="Subject verticals and the manager(s) who own each — a capability can have several. Everyone here is notified (Teams @mention + email + in-app) the moment a ticket lands for their subject. Add a new vertical or a manager and it takes effect instantly."
      />
      {adminLike && (
        <FadeIn>
          <NewCapability />
        </FadeIn>
      )}
      <FadeIn delay={0.1}>
        <DirectoryTable
          table="capability_managers"
          columns={columns}
          initial={(data ?? []) as Row[]}
          canWrite={adminLike}
          defaults={{ status: "active" }}
          labelMaps={{ capability_id: refs.capabilities.map }}
          searchKeys={["name", "email"]}
        />
      </FadeIn>
    </div>
  );
}
