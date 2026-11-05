import Link from "next/link";

/**
 * 단일 색(네이비) 가로 막대 목록. 값과 이름은 텍스트 색으로 표시하고,
 * 막대는 크기만 표현한다. 마우스를 올리면 title 로 정확한 값을 보여준다.
 */
export function BarList({
  rows,
  hrefBase,
  unit = "회",
  max,
  limit = 20,
  sub,
}: {
  rows: { id?: string; name: string; count: number; lastYear?: number }[];
  hrefBase?: string;
  unit?: string;
  max?: number;
  limit?: number;
  sub?: (r: { name: string; count: number; lastYear?: number }) => string | null;
}) {
  const shown = rows.slice(0, limit);
  const m = max ?? Math.max(1, ...shown.map((r) => r.count));
  if (shown.length === 0) return <p className="py-4 text-sm text-faint">데이터가 없습니다.</p>;
  return (
    <ul className="space-y-1">
      {shown.map((r) => {
        const label = (
          <span className="block truncate text-sm text-ink">
            {r.name}
            {sub?.(r) && <span className="ml-1 text-xs text-faint">{sub(r)}</span>}
          </span>
        );
        return (
          <li
            key={r.id ?? r.name}
            className="group grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-2 sm:grid-cols-[10rem_1fr_3rem]"
            title={`${r.name}: ${r.count}${unit}${r.lastYear ? ` (최근 ${r.lastYear})` : ""}`}
          >
            {hrefBase && r.id ? (
              <Link href={`${hrefBase}/${r.id}`} className="hover:underline">
                {label}
              </Link>
            ) : (
              label
            )}
            <div className="h-3.5 rounded-r bg-transparent">
              <div
                className="h-full rounded-r-[4px] bg-navy/80 group-hover:bg-navy"
                style={{ width: `${Math.max(2, (r.count / m) * 100)}%` }}
              />
            </div>
            <span className="text-right text-sm tabular-nums text-muted">
              {r.count}
              {unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
