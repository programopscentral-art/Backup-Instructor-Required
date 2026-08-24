import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createAuthedClient } from "@/lib/supabase/server";
import { isAdminLike } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

interface ExportRow {
  ticket_no: string | null;
  status: string | null;
  mode: string | null;
  reason_category: string | null;
  absent_instructor_name: string | null;
  raised_by_name: string | null;
  raised_by_email: string | null;
  created_at: string | null;
  universities: { name: string } | null;
  subjects: { name: string } | null;
  capabilities: { manager_name: string | null } | null;
}

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // Neutralize spreadsheet formula injection: a cell starting with = + - @ (or a
  // control char) is treated as a formula by Excel/Sheets. Prefix with a quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the filtered tickets (RLS-scoped: staff only get their campus). */
export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const adminLike = isAdminLike(ctx.roles);
  const isStaff = ctx.roles.includes("university_staff");
  if (!adminLike && !isStaff) return new NextResponse("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const university = adminLike ? searchParams.get("university") || "" : "";

  const supabase = await createAuthedClient();
  let q = supabase
    .from("tickets")
    .select(
      "ticket_no, status, mode, reason_category, absent_instructor_name, raised_by_name, raised_by_email, created_at, universities(name), subjects(name), capabilities(manager_name)",
    )
    .order("created_at", { ascending: false });
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);
  if (university) q = q.eq("university_id", university);
  const { data } = await q;
  const rows = (data ?? []) as unknown as ExportRow[];

  const headers = [
    "Ticket", "Status", "Mode", "Reason", "University", "Subject",
    "Capability Manager", "Absent Instructor", "Raised By", "Raised Email", "Created At",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.ticket_no, r.status, r.mode, r.reason_category,
        r.universities?.name, r.subjects?.name, r.capabilities?.manager_name,
        r.absent_instructor_name, r.raised_by_name, r.raised_by_email, r.created_at,
      ].map(esc).join(","),
    );
  }
  const csv = "﻿" + lines.join("\n"); // BOM for Excel

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-tickets.csv"`,
    },
  });
}
