"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Create a new capability (subject vertical) inline — folds in the one job the
 *  old Capabilities page did, so this page is the single management surface. */
export function NewCapability() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("capabilities").insert({ name: n, status: "active" });
    setBusy(false);
    if (error) {
      setErr(/duplicate|unique/i.test(error.message) ? "That capability already exists." : error.message);
      return;
    }
    setName("");
    setOpen(false);
    router.refresh(); // reload so it appears in the Capability dropdown below
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm gap-1.5">
          <Plus size={14} /> New capability (subject vertical)
        </button>
      </div>
    );
  }

  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <Layers size={16} className="text-[color:var(--accent)]" />
      <input
        autoFocus
        className="input !w-64 !py-2 !text-sm"
        placeholder="New capability name (e.g. Cloud Engineering)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <button onClick={add} disabled={busy} className="btn btn-primary btn-sm">
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setErr(null);
        }}
        className="btn btn-ghost btn-sm"
      >
        Cancel
      </button>
      {err && <span className="text-xs text-[color:var(--rose)]">{err}</span>}
    </div>
  );
}
