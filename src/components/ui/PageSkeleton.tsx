// Shared route-loading skeletons — shown instantly on navigation while the
// server renders. Shapes mirror each page type so the transition feels seamless.

const bar = "rounded bg-[color:var(--cream-2)]";

function HeaderBars() {
  return (
    <div className="mb-6">
      <div className={`h-3 w-20 ${bar}`} />
      <div className={`mt-3 h-8 w-64 max-w-full ${bar}`} />
      <div className={`mt-2 h-4 w-96 max-w-full ${bar}`} />
    </div>
  );
}

/** Table pages: Invoices, Tickets, Logs. */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <HeaderBars />
      <div className="mb-4 flex flex-wrap gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-9 w-32 ${bar}`} />
        ))}
      </div>
      <div className="card overflow-hidden p-4">
        <div className="mb-3 flex gap-4 border-b border-[color:var(--line-2)] pb-3">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className={`h-3 flex-1 ${bar}`} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 py-3">
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} className={`h-4 flex-1 ${bar}`} style={{ opacity: 1 - r * 0.06 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** List/queue pages: HOD Approvals, My Assignments. */
export function ListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="animate-pulse">
      <HeaderBars />
      <div className={`mb-6 h-16 w-full ${bar}`} />
      <div className="space-y-4">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="card p-5" style={{ opacity: 1 - i * 0.12 }}>
            <div className="flex items-center justify-between">
              <div className={`h-5 w-40 ${bar}`} />
              <div className={`h-6 w-20 ${bar}`} />
            </div>
            <div className={`mt-3 h-4 w-3/4 ${bar}`} />
            <div className="mt-4 flex gap-2">
              <div className={`h-9 w-32 ${bar}`} />
              <div className={`h-9 w-24 ${bar}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Analytics: KPI grid + chart. */
export function AnalyticsSkeleton() {
  return (
    <div className="animate-pulse">
      <HeaderBars />
      <div className={`mb-5 h-10 w-72 ${bar}`} />
      <div className={`mb-6 h-16 w-full ${bar}`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-32 ${bar}`} />
        ))}
      </div>
      <div className={`mt-6 h-64 w-full ${bar}`} />
    </div>
  );
}
