"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "bkos-theme";

/**
 * NIAT ⇄ Dark theme switch. Flips `data-theme="dark"` on <html> and remembers
 * the choice in localStorage. UI-only — sets a CSS attribute, nothing else.
 * The no-flash script in the root layout applies the stored choice before paint.
 *
 * variant="icon" → round icon button (used on the login page).
 * variant="menu" → full-width row with an iOS-style switch (used in the profile
 *                  dropdown).
 */
export function ThemeToggle({
  variant = "icon",
  className = "",
}: {
  variant?: "icon" | "menu";
  className?: string;
}) {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (() => {
        try {
          return localStorage.getItem(KEY) === "dark";
        } catch {
          return false;
        }
      })();
    setDark(isDark);
    setReady(true);
  }, []);

  function toggle() {
    // Read the live DOM state (not React state) so the flip is always correct
    // even on rapid or programmatic clicks — no stale-closure races.
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") !== "dark";
    if (next) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    setDark(next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "niat");
    } catch {
      /* private mode — session-only is fine */
    }
  }

  const isDark = ready && dark;

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--cream-2)] ${className}`}
        aria-label={isDark ? "Switch to NIAT (light) mode" : "Switch to Dark mode"}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
        <span>{isDark ? "NIAT mode" : "Dark mode"}</span>
        {/* iOS-style switch */}
        <span
          className="relative ml-auto inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors"
          style={{ background: isDark ? "var(--accent)" : "var(--line-2)" }}
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: isDark ? "translateX(16px)" : "translateX(2px)" }}
          />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-toggle ${className}`}
      aria-label={isDark ? "Switch to NIAT (light) mode" : "Switch to Dark mode"}
      title={isDark ? "NIAT mode" : "Dark mode"}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
