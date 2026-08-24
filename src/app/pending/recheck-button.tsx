"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function RecheckAccessButton() {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function recheck() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("sync_my_access");
    if (error) {
      setBusy(false);
      setMsg(error.message);
      return;
    }
    if (data === true) {
      router.refresh();
      router.push("/dashboard");
    } else {
      setBusy(false);
      setMsg("Still no access — ask an Admin to add your email to a directory (or grant access), then try again.");
    }
  }

  return (
    <div className="w-full">
      <button onClick={recheck} disabled={busy} className="btn btn-primary w-full gap-2">
        <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
        {busy ? "Checking…" : "Re-check my access"}
      </button>
      {msg && <p className="mt-3 text-sm text-[color:var(--rose)]">{msg}</p>}
    </div>
  );
}
