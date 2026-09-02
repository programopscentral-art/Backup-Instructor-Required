"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, X, Ticket, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Note {
  id: string;
  title: string;
  body: string | null;
  ticket_id: string | null;
  read: boolean;
  created_at: string;
}

const DISMISS_KEY = "notif-dismissed-v1";

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveDismissed(s: Set<string>) {
  try {
    // keep the list bounded so it can't grow forever
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...s].slice(-500)));
  } catch {
    /* ignore */
  }
}

/** Compact relative time: "just now", "5m", "3h", "2d", else a date. */
function ago(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const router = useRouter();
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

      // Match by account OR by email — the latter surfaces notifications that were
      // addressed to this person before they had an account (recipient_user_id was
      // null at send time). RLS permits the same two matches.
      const email = (user.email ?? "").toLowerCase();
      const orFilter = email
        ? `recipient_user_id.eq.${user.id},recipient_email.ilike.${email}`
        : `recipient_user_id.eq.${user.id}`;
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, ticket_id, read, created_at")
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!active) return;
      const dismissed = loadDismissed();
      setNotes(((data as Note[]) ?? []).filter((n) => !dismissed.has(n.id)));

      channel = supabase
        .channel(`notif-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new as Note;
            if (loadDismissed().has(n.id)) return;
            setNotes((cur) => [n, ...cur].slice(0, 30));
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const unread = notes.filter((n) => !n.read).length;

  function toggle() {
    setOpen((o) => !o);
  }

  async function markAllRead() {
    const ids = notes.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    setNotes((cur) => cur.map((n) => ({ ...n, read: true })));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
  }

  /** Dismiss one: mark read (persisted) + hide it (remembered in localStorage). */
  async function dismiss(id: string, wasUnread: boolean) {
    setNotes((cur) => cur.filter((n) => n.id !== id));
    const d = loadDismissed();
    d.add(id);
    saveDismissed(d);
    if (wasUnread) {
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    }
  }

  function openNote(n: Note) {
    setOpen(false);
    if (!n.read) {
      setNotes((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      createClient().from("notifications").update({ read: true }).eq("id", n.id);
    }
    if (n.ticket_id) router.push(`/dashboard/tickets/${n.ticket_id}`);
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-[color:var(--line-2)] bg-white text-[color:var(--muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        {unread > 0 ? <BellRing size={17} /> : <Bell size={17} />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[color:var(--accent)] px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-away backdrop (very subtle dim so the panel reads as a layer) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/5"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              role="dialog"
              aria-label="Notifications"
              className="absolute right-0 top-full z-50 mt-2 flex max-h-[70vh] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white shadow-[0_24px_60px_-18px_rgba(0,0,0,0.28)]"
            >
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-[color:var(--line)] bg-[color:var(--cream)] px-4 py-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                  <Bell size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight text-[color:var(--ink)]">Notifications</p>
                  <p className="text-[11px] leading-tight text-[color:var(--faint)]">
                    {unread > 0 ? `${unread} unread` : "All caught up"}
                  </p>
                </div>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent-soft)]"
                  >
                    <Check size={12} /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-7 w-7 place-items-center rounded-full text-[color:var(--faint)] transition-colors hover:bg-[color:var(--cream-2)] hover:text-[color:var(--ink)]"
                >
                  <X size={15} />
                </button>
              </div>

              {/* List */}
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {notes.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--cream-2)] text-[color:var(--faint)]">
                      <Bell size={22} />
                    </span>
                    <p className="text-sm font-semibold text-[color:var(--ink)]">You&apos;re all caught up</p>
                    <p className="text-xs text-[color:var(--faint)]">New backup requests and updates land here.</p>
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {notes.map((n) => (
                      <li key={n.id} className="group relative">
                        <button
                          onClick={() => openNote(n)}
                          className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 pr-9 text-left transition-colors hover:bg-[color:var(--cream-2)] ${
                            n.read ? "" : "bg-[color:var(--accent-soft)]/40"
                          } ${n.ticket_id ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {/* Unread dot / icon avatar */}
                          <span className="relative mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                            {n.ticket_id ? <Ticket size={15} /> : <Bell size={15} />}
                            {!n.read && (
                              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[color:var(--accent)] ring-2 ring-white" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] leading-snug ${n.read ? "font-semibold text-[color:var(--ink)]" : "font-bold text-[color:var(--ink)]"}`}>
                              {n.title}
                            </span>
                            {n.body && (
                              <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-[color:var(--muted)]">
                                {n.body}
                              </span>
                            )}
                            <span className="mt-1 block text-[10px] font-medium text-[color:var(--faint)]">
                              {ago(n.created_at)}
                            </span>
                          </span>
                        </button>
                        {/* Per-item close */}
                        <button
                          onClick={() => dismiss(n.id, !n.read)}
                          aria-label="Dismiss"
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-[color:var(--faint)] opacity-0 transition-all hover:bg-white hover:text-[color:var(--rose)] group-hover:opacity-100 focus:opacity-100"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
