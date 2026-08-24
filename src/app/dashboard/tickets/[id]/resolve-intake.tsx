"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, AlertTriangle, BookOpen } from "lucide-react";
import { resolveTicketIntake, type ActionState } from "../actions";

const NEW = "__new__";

export function ResolveIntake({
  ticketId,
  universities,
  subjects,
  currentSubjectId,
  needsUniversity,
}: {
  ticketId: string;
  universities: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  currentSubjectId: string | null;
  needsUniversity: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveTicketIntake, {});
  const router = useRouter();
  const [uni, setUni] = useState("");
  const [remapSubject, setRemapSubject] = useState(false);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="ticket_id" value={ticketId} />

      <div className="flex items-start gap-2 rounded-xl border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2.5 text-sm text-[color:var(--rose)]">
        <AlertTriangle size={16} className="mt-0.5 flex-none" />
        <span>
          This Zoho ticket&apos;s university didn&apos;t match the directory. Set the correct campus
          (or add it) to unblock — future tickets for it will then match automatically.
        </span>
      </div>

      {/* University */}
      <div>
        <label className="label flex items-center gap-1.5">
          <Building2 size={14} /> University {needsUniversity && <span className="text-[color:var(--rose)]">*</span>}
        </label>
        <select
          name="university_id"
          value={uni}
          onChange={(e) => setUni(e.target.value)}
          required={needsUniversity}
          className="select"
        >
          <option value="">Select a university…</option>
          {universities.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
          <option value={NEW}>+ Add a new university…</option>
        </select>
      </div>

      {uni === NEW && (
        <div className="space-y-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] p-3">
          <div>
            <label className="label">New university name</label>
            <input name="new_university_name" placeholder="e.g. Malla Reddy Vishwavidyapeeth - Hyderabad" className="input" />
          </div>
          <div>
            <label className="label">City (optional)</label>
            <input name="new_university_city" placeholder="e.g. Hyderabad" className="input" />
          </div>
          <p className="text-xs text-[color:var(--faint)]">Adds it to the directory so it matches from now on.</p>
        </div>
      )}

      {/* Optional subject remap */}
      <div>
        {!remapSubject ? (
          <button
            type="button"
            onClick={() => setRemapSubject(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--accent)] hover:underline"
          >
            <BookOpen size={13} /> Fix subject too?
          </button>
        ) : (
          <>
            <label className="label flex items-center gap-1.5">
              <BookOpen size={14} /> Remap subject
            </label>
            <select name="subject_id" defaultValue={currentSubjectId ?? ""} className="select">
              <option value="">— keep current —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[color:var(--faint)]">Re-points the ticket to an existing subject (re-routes its Capability Manager).</p>
          </>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Resolve & continue"}
      </button>
    </form>
  );
}
