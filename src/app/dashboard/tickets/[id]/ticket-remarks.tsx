"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtIST } from "@/lib/format";
import { addRemark, type ActionState } from "../actions";

export interface Remark {
  id: string;
  author_name: string | null;
  author_role: string | null;
  body: string;
  created_at: string;
}

const roleLabel = (r: string | null) =>
  r ? r.replace(/_/g, " ").replace(/\bcma\b/i, "CM Assistant").replace(/\bhod\b/i, "HOD") : "";

/**
 * A shared remark thread on a ticket. Anyone who can see the ticket sees every
 * remark and can post one; new remarks appear live (realtime) for everyone with
 * the ticket open. Server-side RLS is the real gate — this is the UI for it.
 */
export function TicketRemarks({ ticketId, initial }: { ticketId: string; initial: Remark[] }) {
  const [remarks, setRemarks] = useState<Remark[]>(initial);
  const [state, action, pending] = useActionState<ActionState, FormData>(addRemark, {});
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Live updates — a remark from anyone on this ticket appears without a refresh.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`remarks:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_remarks", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const r = payload.new as Remark;
          setRemarks((cur) => (cur.some((x) => x.id === r.id) ? cur : [...cur, r]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);

  // Clear the box after a successful post.
  useEffect(() => {
    if (state.ok) {
      setText("");
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <div className="card p-6">
      <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold">
        <MessageSquare size={16} /> Remarks
        {remarks.length > 0 && <span className="pill pill-muted">{remarks.length}</span>}
      </h2>

      <div className="space-y-3">
        {remarks.length === 0 && (
          <p className="text-sm text-[color:var(--faint)]">
            No remarks yet. Add one below — everyone on this ticket will see it.
          </p>
        )}
        {remarks.map((r) => (
          <div key={r.id} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--cream)] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-sm font-semibold text-[color:var(--ink)]">
                {r.author_name ?? "Someone"}
                {r.author_role && <span className="ml-1.5 pill pill-muted align-middle">{roleLabel(r.author_role)}</span>}
              </span>
              <span className="text-xs text-[color:var(--faint)]">{fmtIST(r.created_at)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[color:var(--ink)]">{r.body}</p>
          </div>
        ))}
      </div>

      <form ref={formRef} action={action} className="mt-4 space-y-2">
        <input type="hidden" name="ticket_id" value={ticketId} />
        <textarea
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          className="input resize-y"
          placeholder="Add a remark for everyone on this ticket…"
        />
        {state.error && (
          <p className="rounded-lg border border-[#f6cdd6] bg-[#fdeef1] px-3 py-2 text-sm text-[color:var(--rose)]">{state.error}</p>
        )}
        <button type="submit" disabled={pending || !text.trim()} className="btn btn-primary btn-sm">
          {pending ? "Posting…" : "Post remark"}
        </button>
      </form>
    </div>
  );
}
