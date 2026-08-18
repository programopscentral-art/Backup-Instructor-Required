"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Note {
  id: string;
  title: string;
  body: string | null;
  ticket_id: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, ticket_id, read, created_at")
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!active) return;
      setNotes((data as Note[]) ?? []);

      channel = supabase
        .channel(`notif-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` },
          (payload) => setNotes((cur) => [payload.new as Note, ...cur].slice(0, 20)),
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const unread = notes.filter((n) => !n.read).length;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const supabase = createClient();
      const ids = notes.filter((n) => !n.read).map((n) => n.id);
      setNotes((cur) => cur.map((n) => ({ ...n, read: true })));
      await supabase.from("notifications").update({ read: true }).in("id", ids);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-[color:var(--muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 top-full z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-[color:var(--line)] bg-white p-1.5 shadow-[var(--shadow)]"
            >
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--faint)]">
                Notifications
              </p>
              {notes.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[color:var(--faint)]">Nothing yet.</p>
              ) : (
                notes.map((n) => {
                  const inner = (
                    <div className="rounded-xl px-3 py-2.5 transition-colors hover:bg-[color:var(--cream-2)]">
                      <p className="text-sm font-semibold text-[color:var(--ink)]">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-[color:var(--muted)]">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-[color:var(--faint)]">
                        {new Date(n.created_at).toLocaleString("en-IN")}
                      </p>
                    </div>
                  );
                  return n.ticket_id ? (
                    <Link key={n.id} href={`/dashboard/tickets/${n.ticket_id}`} onClick={() => setOpen(false)}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
