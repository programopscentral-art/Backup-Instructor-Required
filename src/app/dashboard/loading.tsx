// Shown instantly on every dashboard navigation while the server renders the
// real page — makes clicks feel immediate even on fresh (dynamic) data loads.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-56 rounded-lg bg-[color:var(--cream-2)]" />
      <div className="mb-2 h-4 w-80 max-w-full rounded bg-[color:var(--cream-2)]" />

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card relative h-32 overflow-hidden">
            <div className="shimmer absolute inset-0" />
            <div className="p-5">
              <div className="h-10 w-10 rounded-xl bg-[color:var(--cream-2)]" />
              <div className="mt-4 h-7 w-16 rounded bg-[color:var(--cream-2)]" />
              <div className="mt-2 h-3 w-24 rounded bg-[color:var(--cream-2)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
