"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Row = Record<string, unknown> & { id: string };

/**
 * Subscribes to Postgres changes on `table` and keeps a live row list in sync.
 * Any insert/update/delete — from this user or anyone else — updates the UI
 * without a refresh.
 */
export function useRealtimeTable(table: string, initial: Row[]) {
  const [rows, setRows] = useState<Row[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          setRows((cur) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Row;
              return cur.some((r) => r.id === row.id) ? cur : [...cur, row];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Row;
              return cur.map((r) => (r.id === row.id ? row : r));
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as { id: string };
              return cur.filter((r) => r.id !== old.id);
            }
            return cur;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);

  return { rows, setRows };
}
