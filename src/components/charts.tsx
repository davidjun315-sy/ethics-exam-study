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

/** 연도 × 항목 출제 빈도 표 (단일 색 명도로 크기 표현, 숫자 병기) */
export function Heatmap({
  years,
  rows,
  values,
  hrefBase,
}: {
  years: number[];
  rows: { id: string; name: string }[];
  values: Record<number, Record<string, number>>;
  hrefBase?: string;
}) {
  const max = Math.max(1, ...years.flatMap((y) => rows.map((r) => values[y]?.[r.id] ?? 0)));
  if (rows.length === 0 || years.length === 0) return <p className="py-4 text-sm text-faint">데이터가 없습니다.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-auto border-separate border-spacing-[2px] text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface px-2 py-1 text-left font-semibold text-muted">사상가</th>
            {years.map((y) => (
              <th key={y} className="px-1 py-1 text-center font-medium tabular-nums text-muted">
                {String(y).slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="sticky left-0 whitespace-nowrap bg-surface px-2 py-1">
                {hrefBase ? (
                  <Link href={`${hrefBase}/${r.id}`} className="hover:text-navy hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </td>
              {years.map((y) => {
                const v = values[y]?.[r.id] ?? 0;
                const alpha = v === 0 ? 0 : 0.18 + 0.72 * (v / max);
                return (
                  <td
                    key={y}
                    title={`${y}학년도 ${r.name}: ${v}문항`}
                    className="h-7 w-10 min-w-10 rounded text-center tabular-nums"
                    style={{
                      background: v ? `color-mix(in srgb, var(--navy) ${Math.round(alpha * 100)}%, transparent)` : "var(--surface-2)",
                      color: alpha > 0.55 ? "var(--surface)" : "var(--ink)",
                    }}
                  >
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
