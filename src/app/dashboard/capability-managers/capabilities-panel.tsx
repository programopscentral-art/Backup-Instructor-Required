"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers, Pencil, Check, X, Power } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface Vertical {
  id: string;
  name: string;
  status: string;
  cms: number;
}

/** Manage the subject verticals (capabilities) themselves — create, rename,
 *  activate/retire — in the same place as their managers. */
export function CapabilitiesPanel({ verticals, canWrite }: { verticals: Vertical[]; canWrite: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const supabase = () => createClient();

  async function add() {
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase().from("capabilities").insert({ name: n, status: "active" });
    setBusy(false);
    if (error) return setErr(/duplicate|unique/i.test(error.message) ? "That vertical already exists." : error.message);
    setNewName("");
    setAdding(false);
    router.refresh();
  }

  async function rename(id: string) {
    const n = editName.trim();
    if (!n) return setEditId(null);
    setBusy(true);
    setErr(null);
    const { error } = await supabase().from("capabilities").update({ name: n }).eq("id", id);
    setBusy(false);
    if (error) return setErr(error.message);
    setEditId(null);
    router.refresh();
  }

  async function toggleStatus(v: Vertical) {
    setBusy(true);
    setErr(null);
    const { error } = await supabase()
      .from("capabilities")
      .update({ status: v.status === "active" ? "inactive" : "active" })
      .eq("id", v.id);
    setBusy(false);
    if (error) return setErr(error.message);
    router.refresh();
  }

  return (
    <div className="card mb-6 p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <Layers size={17} className="text-[color:var(--accent)]" />
        <span className="font-[family-name:var(--font-display)] text-base font-bold">Subject verticals</span>
        <span className="pill pill-muted">{verticals.length}</span>
        <span className="ml-auto text-xs text-[color:var(--muted)]">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="mt-4">
          {err && <p className="mb-2 text-sm text-[color:var(--rose)]">{err}</p>}
          <ul className="divide-y divide-[color:var(--line-2)]">
            {verticals.map((v) => (
              <li key={v.id} className="flex items-center gap-2 py-2.5 text-sm">
                {editId === v.id ? (
                  <>
                    <input
                      autoFocus
                      className="input !w-64 !py-1.5 !text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && rename(v.id)}
                    />
                    <button onClick={() => rename(v.id)} disabled={busy} className="btn btn-primary btn-sm gap-1">
                      <Check size={13} /> Save
                    </button>
                    <button onClick={() => setEditId(null)} className="btn btn-ghost btn-sm">
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`min-w-0 flex-1 truncate font-medium ${v.status !== "active" ? "text-[color:var(--faint)] line-through" : ""}`}>
                      {v.name}
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--faint)]">{v.cms} CM{v.cms !== 1 ? "s" : ""}</span>
                    {v.status === "active" ? <span className="pill pill-good shrink-0">Active</span> : <span className="pill pill-muted shrink-0">Retired</span>}
                    {canWrite && (
                      <>
                        <button
                          onClick={() => {
                            setEditId(v.id);
                            setEditName(v.name);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--faint)] hover:bg-[color:var(--cream-2)] hover:text-[color:var(--accent)]"
                          title="Rename"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => toggleStatus(v)}
                          disabled={busy}
                          className="grid h-7 w-7 place-items-center rounded-lg text-[color:var(--faint)] hover:bg-[color:var(--cream-2)] hover:text-[color:var(--rose)]"
                          title={v.status === "active" ? "Retire" : "Reactivate"}
                        >
                          <Power size={14} />
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          {canWrite &&
            (adding ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  className="input !w-64 !py-1.5 !text-sm"
                  placeholder="New vertical name (e.g. Cloud Engineering)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
                <button onClick={add} disabled={busy} className="btn btn-primary btn-sm">
                  {busy ? "Adding…" : "Add"}
                </button>
                <button onClick={() => setAdding(false)} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="btn btn-ghost btn-sm mt-3 gap-1.5">
                <Plus size={14} /> New vertical
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
