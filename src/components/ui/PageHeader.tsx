import type { ReactNode } from "react";
import { FadeIn } from "./motion";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <FadeIn className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent)]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm text-[color:var(--muted)]">{subtitle}</p>
        )}
      </div>
      {action}
    </FadeIn>
  );
}
