import type { ProcessProgress } from "@/lib/admin-client";

export function ProgressBar({ p }: { p: ProcessProgress | null }) {
  if (!p) return null;
  const ratio = p.total ? Math.min(1, p.done / p.total) : 0;
  return (
    <div className="space-y-1" role="status" aria-live="polite">
      <div className="text-sm text-muted">{p.step}</div>
      <div className="h-2 overflow-hidden rounded bg-surface-2">
        <div className="h-full bg-navy transition-all" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}
