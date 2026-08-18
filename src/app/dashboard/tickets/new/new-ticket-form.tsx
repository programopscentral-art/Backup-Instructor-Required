"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, BellRing, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createTicket, type ActionState } from "../actions";

export interface SubjectOption {
  id: string;
  name: string;
  capability: string | null;
  manager: string | null;
}
interface InstructorOpt {
  id: string;
  instructor_name: string;
  emp_id: string | null;
  university_id: string | null;
}
interface ReasonOpt {
  id: string;
  label: string;
}
interface CmOpt {
  user_id: string;
  name: string;
  email: string;
  capability: string | null;
}

const ADD = "__add__";

export function NewTicketForm({
  universities,
  subjects,
  instructors,
  reasons,
  cms,
}: {
  universities: { id: string; name: string }[];
  subjects: SubjectOption[];
  instructors: InstructorOpt[];
  reasons: ReasonOpt[];
  cms: CmOpt[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTicket, {});
  const router = useRouter();
  const supabase = createClient();

  const [universityId, setUniversityId] = useState(universities.length === 1 ? universities[0].id : "");
  const [subjectId, setSubjectId] = useState("");

  // Reason (dynamic)
  const [reasonList, setReasonList] = useState(reasons);
  const [reason, setReason] = useState("");
  const [addingReason, setAddingReason] = useState(false);
  const [newReason, setNewReason] = useState("");

  // Absent instructor (dynamic, scoped to university)
  const [instrList, setInstrList] = useState(instructors);
  const [instrId, setInstrId] = useState("");
  const [instrName, setInstrName] = useState("");
  const [addingInstr, setAddingInstr] = useState(false);
  const [newInstrName, setNewInstrName] = useState("");
  const [newInstrEmp, setNewInstrEmp] = useState("");

  // Notify CMs
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyIds, setNotifyIds] = useState<string[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subject = subjects.find((s) => s.id === subjectId);
  const noCM = subject && !subject.capability;

  const universityInstructors = useMemo(
    () => instrList.filter((i) => i.university_id === universityId),
    [instrList, universityId],
  );

  useEffect(() => {
    if (state.ticketId) router.push(`/dashboard/tickets/${state.ticketId}`);
  }, [state.ticketId, router]);

  // Reset instructor when university changes
  useEffect(() => {
    setInstrId("");
    setInstrName("");
    setAddingInstr(false);
  }, [universityId]);

  async function saveNewReason() {
    if (!newReason.trim()) return;
    setBusy("reason");
    setError(null);
    const { data, error } = await supabase
      .from("ticket_reasons")
      .insert({ label: newReason.trim() })
      .select("id, label")
      .single();
    setBusy(null);
    if (error) return setError(error.message);
    setReasonList((l) => [...l, data]);
    setReason(data.label);
    setNewReason("");
    setAddingReason(false);
  }

  async function saveNewInstructor() {
    if (!newInstrName.trim()) return setError("Instructor name is required.");
    if (!universityId) return setError("Pick a university first.");
    setBusy("instr");
    setError(null);
    const { data, error } = await supabase
      .from("instructors")
      .insert({
        instructor_name: newInstrName.trim(),
        emp_id: newInstrEmp.trim() || null,
        university_id: universityId,
        subject_id: subjectId || null,
        status: "active",
      })
      .select("id, instructor_name, emp_id, university_id")
      .single();
    setBusy(null);
    if (error) return setError(error.message);
    setInstrList((l) => [...l, data]);
    setInstrId(data.id);
    setInstrName(data.instructor_name);
    setNewInstrName("");
    setNewInstrEmp("");
    setAddingInstr(false);
  }

  function toggleNotify(id: string) {
    setNotifyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="reason_category" value={reason} />
      <input type="hidden" name="absent_instructor_id" value={instrId} />
      <input type="hidden" name="absent_instructor_name" value={instrName} />
      <input type="hidden" name="notify_cm_ids" value={notifyIds.join(",")} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label">University *</label>
          <select name="university_id" required value={universityId} onChange={(e) => setUniversityId(e.target.value)} className="select">
            <option value="" disabled>
              Select…
            </option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Subject *</label>
          <select name="subject_id" required value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="select">
            <option value="" disabled>
              Select…
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {subject && subject.capability && (
        <p className="rounded-xl border border-[color:var(--line)] bg-[color:var(--cream-2)] px-3.5 py-2.5 text-sm text-[color:var(--muted)]">
          Routes to <span className="font-semibold text-[color:var(--ink)]">{subject.capability}</span>
          {subject.manager && (
            <>
              {" "}· CM <span className="font-semibold text-[color:var(--ink)]">{subject.manager}</span>
            </>
          )}
        </p>
      )}
      {noCM && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#f6cdd6] bg-[#fdeef1] px-3.5 py-2.5 text-sm text-[color:var(--rose)]">
          <AlertTriangle size={17} className="mt-0.5 flex-none" />
          <span>
            This subject has <strong>no Capability Manager</strong> yet. Use{" "}
            <button type="button" onClick={() => setNotifyOpen(true)} className="font-semibold underline">
              Notify Capability Managers
            </button>{" "}
            below to alert one, or an admin can add a CM in Capabilities.
          </span>
        </div>
      )}

      {/* Reason (dynamic dropdown) */}
      <div>
        <label className="label">Reason *</label>
        {addingReason ? (
          <div className="flex gap-2">
            <input className="input" placeholder="Type a new reason…" value={newReason} onChange={(e) => setNewReason(e.target.value)} autoFocus />
            <button type="button" onClick={saveNewReason} disabled={busy === "reason"} className="btn btn-primary btn-sm flex-none">
              <Check size={14} /> Add
            </button>
            <button type="button" onClick={() => setAddingReason(false)} className="btn btn-ghost btn-sm flex-none">
              Cancel
            </button>
          </div>
        ) : (
          <select
            className="select"
            value={reason}
            onChange={(e) => (e.target.value === ADD ? (setAddingReason(true), setReason("")) : setReason(e.target.value))}
          >
            <option value="" disabled>
              Select a reason…
            </option>
            {reasonList.map((r) => (
              <option key={r.id} value={r.label}>
                {r.label}
              </option>
            ))}
            <option value={ADD}>+ Add new reason…</option>
          </select>
        )}
      </div>

      {/* Absent instructor (dynamic dropdown, scoped to university) */}
      <div>
        <label className="label">Instructor needing backup *</label>
        {addingInstr ? (
          <div className="space-y-2 rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] p-3">
            <input className="input" placeholder="Instructor name" value={newInstrName} onChange={(e) => setNewInstrName(e.target.value)} autoFocus />
            <input className="input" placeholder="Emp ID (optional)" value={newInstrEmp} onChange={(e) => setNewInstrEmp(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" onClick={saveNewInstructor} disabled={busy === "instr"} className="btn btn-primary btn-sm">
                <Plus size={14} /> Add to {universities.find((u) => u.id === universityId)?.name ?? "university"}
              </button>
              <button type="button" onClick={() => setAddingInstr(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
            <p className="text-xs text-[color:var(--faint)]">Adds the instructor permanently to this university&apos;s directory.</p>
          </div>
        ) : (
          <select
            className="select"
            value={instrId}
            disabled={!universityId}
            onChange={(e) => {
              if (e.target.value === ADD) {
                setAddingInstr(true);
                return;
              }
              setInstrId(e.target.value);
              const it = instrList.find((i) => i.id === e.target.value);
              setInstrName(it?.instructor_name ?? "");
            }}
          >
            <option value="" disabled>
              {universityId ? "Select the absent instructor…" : "Pick a university first"}
            </option>
            {universityInstructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.instructor_name}
                {i.emp_id ? ` (${i.emp_id})` : ""}
              </option>
            ))}
            {universityId && <option value={ADD}>+ Add instructor…</option>}
          </select>
        )}
      </div>

      <div>
        <label className="label">Additional notes</label>
        <input name="reason" placeholder="Any extra detail (optional)" className="input" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label">Backup needed from</label>
          <input name="absent_from" type="date" className="input" />
        </div>
        <div>
          <label className="label">Backup needed to</label>
          <input name="absent_to" type="date" className="input" />
        </div>
        <div>
          <label className="label">Time from</label>
          <input name="time_from" type="time" className="input" />
        </div>
        <div>
          <label className="label">Time to</label>
          <input name="time_to" type="time" className="input" />
        </div>
      </div>

      <div>
        <label className="label">Requested mode</label>
        <select name="requested_mode" defaultValue="undecided" className="select">
          <option value="undecided">No preference</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {/* Notify capability managers (optional) */}
      <div className="rounded-xl border border-[color:var(--line)] p-4">
        <button type="button" onClick={() => setNotifyOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-semibold text-[color:var(--ink)]">
          <span className="flex items-center gap-2">
            <BellRing size={15} className="text-[color:var(--accent)]" /> Notify Capability Managers
            <span className="text-xs font-normal text-[color:var(--muted)]">(optional)</span>
          </span>
          <span className="text-xs text-[color:var(--muted)]">{notifyIds.length ? `${notifyIds.length} selected` : "none"}</span>
        </button>
        {notifyOpen && (
          <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto">
            {cms.length === 0 && <p className="text-sm text-[color:var(--faint)]">No capability managers found.</p>}
            {cms.map((c) => (
              <label
                key={c.user_id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-[color:var(--line)] px-3 py-2 text-sm hover:bg-[color:var(--cream-2)]"
              >
                <input type="checkbox" checked={notifyIds.includes(c.user_id)} onChange={() => toggleNotify(c.user_id)} className="accent-[color:var(--accent)]" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-[color:var(--ink)]">{c.name || c.email}</span>
                  {c.capability && <span className="text-[color:var(--muted)]"> · {c.capability}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {(error || state.error) && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">
          {error || state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Raising…" : "Raise ticket"}
      </button>
    </form>
  );
}
