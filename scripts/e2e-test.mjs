// End-to-end pipeline test against the live DB (service role bypasses RLS).
// Drives a ticket through the FULL lifecycle + the SLA cron, asserting each step,
// then cleans up.  Run: node --env-file=.env.local scripts/e2e-test.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

let pass = 0,
  fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  console.log("\n▶ NIAT Backup Instructor — end-to-end pipeline test\n");

  // Clean any prior test rows
  await sb.from("tickets").delete().eq("reason", "E2E-TEST");

  // Pick real reference rows
  const { data: uni } = await sb.from("universities").select("id, name").limit(1).single();
  const { data: subj } = await sb
    .from("subjects")
    .select("id, name, capability_id")
    .not("capability_id", "is", null)
    .limit(1)
    .single();
  const { data: admin } = await sb
    .from("profiles")
    .select("id")
    .eq("email", "programopscentral@nxtwave.in")
    .maybeSingle();
  const { data: backup } = await sb
    .from("backup_instructor_pool")
    .select("id, instructor_name")
    .eq("capability_id", subj.capability_id)
    .limit(1)
    .maybeSingle();

  console.log(`  · University: ${uni.name}`);
  console.log(`  · Subject: ${subj.name}`);
  console.log(`  · Backup: ${backup?.instructor_name ?? "(none in pool)"}\n`);

  // 1. Raise
  const { data: t, error: e1 } = await sb
    .from("tickets")
    .insert({
      university_id: uni.id,
      subject_id: subj.id,
      capability_id: subj.capability_id,
      absent_instructor_name: "E2E Absent Instructor",
      reason: "E2E-TEST",
      requested_mode: "offline",
      raised_by: admin?.id ?? null,
      status: "raised",
    })
    .select("id, ticket_no, status")
    .single();
  check("raise ticket", !e1 && t?.status === "raised", e1?.message);
  check("auto ticket number (BIT-####)", /^BIT-\d{4}$/.test(t.ticket_no || ""), t?.ticket_no);
  const id = t.id;

  const step = async (label, patch, expect) => {
    const { error } = await sb.from("tickets").update(patch).eq("id", id);
    const { data } = await sb.from("tickets").select("status").eq("id", id).single();
    check(label, !error && data.status === expect, error?.message || `got ${data?.status}`);
  };

  // 2-5. assign → confirm → session → invoice_pending (overdue)
  await step(
    "assign backup + offline mode",
    { status: "backup_assigned", mode: "offline", assigned_backup_name: backup?.instructor_name ?? "Test Backup", assigned_backup_id: backup?.id ?? null },
    "backup_assigned",
  );
  await step("ops confirm & dispatch", { status: "confirmed" }, "confirmed");
  await step("mark session delivered", { status: "session_done" }, "session_done");
  await step(
    "proceed to invoice (24h clock, backdated to test SLA)",
    { status: "invoice_pending", invoice_due_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    "invoice_pending",
  );

  // 6. SLA cron flags the overdue ticket (no invoice yet)
  const { error: rpcErr } = await sb.rpc("mark_overdue_invoices");
  const { data: flagged } = await sb.from("tickets").select("red_flag").eq("id", id).single();
  check("SLA cron marks red_flag", !rpcErr && flagged.red_flag === true, rpcErr?.message);

  // 7. Submit invoice
  const { data: inv, error: eInv } = await sb
    .from("invoices")
    .insert({
      ticket_id: id,
      description: "E2E claim",
      amount: 4200,
      nxtclaim_link: "https://nxtclaim.example/e2e",
      status: "submitted",
      submitted_by: admin?.id ?? null,
      submitted_by_name: "E2E",
    })
    .select("id")
    .single();
  check("submit invoice (NxtClaim + amount)", !eInv && !!inv?.id, eInv?.message);
  await sb.from("invoice_files").insert({ invoice_id: inv.id, path: "e2e/slip.pdf", name: "slip.pdf" });
  const { data: files } = await sb.from("invoice_files").select("id").eq("invoice_id", inv.id);
  check("charge slip attached", (files?.length ?? 0) === 1);

  // 8. Ops approve → HOD approve → close
  await sb.from("invoices").update({ status: "ops_approved" }).eq("id", inv.id);
  await step("ops approve claim", { status: "ops_approved" }, "ops_approved");
  await sb.from("invoices").update({ status: "hod_approved" }).eq("id", inv.id);
  await step("HOD final approval", { status: "hod_approved" }, "hod_approved");
  await step("close ticket", { status: "closed" }, "closed");

  const { data: invFinal } = await sb.from("invoices").select("status").eq("id", inv.id).single();
  check("invoice fully approved", invFinal.status === "hod_approved");

  // Cleanup
  await sb.from("tickets").delete().eq("id", id);
  const { data: gone } = await sb.from("tickets").select("id").eq("id", id).maybeSingle();
  check("cleanup (cascade delete)", gone === null);

  console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("✗ Test crashed:", e.message);
  process.exit(1);
});
