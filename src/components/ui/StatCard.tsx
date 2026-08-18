import type { ReactNode } from "react";
import { Counter } from "./Counter";

const ACCENTS: Record<string, string> = {
  accent: "153,27,27",
  crimson: "153,27,27",
  violet: "109,40,217",
  emerald: "4,120,87",
  amber: "180,83,9",
  rose: "190,18,60",
  blue: "29,78,216",
};

export function StatCard({
  label,
  value,
  icon,
  accent = "accent",
  hint,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent?: keyof typeof ACCENTS | string;
  hint?: string;
}) {
  const rgb = ACCENTS[accent] ?? ACCENTS.accent;
  return (
    <div
      className="card card-hover relative overflow-hidden p-5"
      style={{ ["--rgb" as string]: rgb }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl"
        style={{ background: `rgba(${rgb},0.18)` }}
      />
      <div className="flex items-start justify-between">
        <div
          className="grid h-11 w-11 place-items-center rounded-xl"
          style={{ background: `rgba(${rgb},0.14)`, color: `rgb(${rgb})` }}
        >
          {icon}
        </div>
        {hint && <span className="pill pill-muted">{hint}</span>}
      </div>
      <div className="mt-4">
        <div
          className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          <Counter value={value} />
        </div>
        <div className="mt-1 text-sm text-[color:var(--muted)]">{label}</div>
      </div>
    </div>
  );
}
