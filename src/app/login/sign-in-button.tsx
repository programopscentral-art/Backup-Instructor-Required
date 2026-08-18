"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        // No single-domain `hd` hint — both @nxtwave.in and @nxtwave.co.in must
        // be allowed. The @nxtwave lock is enforced server-side in the callback.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        onClick={signIn}
        disabled={loading}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="btn btn-primary w-full py-3 text-[15px]"
      >
        {loading ? (
          "Connecting…"
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 11v2.8h4.6c-.2 1.2-1.5 3.6-4.6 3.6-2.8 0-5-2.3-5-5.1s2.2-5.1 5-5.1c1.6 0 2.6.7 3.2 1.3l2.2-2.1C15.9 5 14.2 4.2 12 4.2 7.7 4.2 4.2 7.7 4.2 12s3.5 7.8 7.8 7.8c4.5 0 7.5-3.2 7.5-7.6 0-.5-.1-.9-.1-1.2H12z" />
            </svg>
            Continue with Google
          </>
        )}
      </motion.button>
      {error && <p className="text-sm text-[color:var(--rose)]">{error}</p>}
    </div>
  );
}
