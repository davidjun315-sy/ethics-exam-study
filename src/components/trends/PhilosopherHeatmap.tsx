"use client";

import Link from "next/link";
import { useState } from "react";

interface Row {
  id: string;
  name: string;
  count: number;
}
interface Group {
  chapter: string;
  total: number;
  rows: Row[];
}

const ALL = "전체보기";

/**
 * 연도별 사상가 출제 빈도: 전체보기 / 분류별 탭.
 * 각 탭은 출제 많은 순. 색 농도는 전체 기준이라 탭을 바꿔도 같은 숫자는 같은 색이다.
 */
export function PhilosopherHeatmap({ years, groups, values }: { years: number[]; groups: Group[]; values: Record<number, Record<string, number>> }) {
  const [tab, setTab] = useState(ALL);
  const chapterOf = new Map(groups.flatMap((g) => g.rows.map((r) => [r.id, g.chapter] as const)));
  const all = groups.flatMap((g) => g.rows).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const current = tab === ALL ? null : groups.find((g) => g.chapter === tab);
  const rows = current ? current.rows : all;
  const max = Math.max(1, ...years.flatMap((y) => all.map((r) => values[y]?.[r.id] ?? 0)));
  const tabs = [{ key: ALL, label: ALL, n: all.length }, ...groups.map((g) => ({ key: g.chapter, label: g.chapter, n: g.rows.length }))];

  if (all.length === 0 || years.length === 0) return <p className="py-4 text-sm text-faint">데이터가 없습니다.</p>;
  return (
    <div className="space-y-3">
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${tab === t.key ? "bg-surface font-semibold text-navy shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {t.label} <span className="text-xs text-faint">{t.n}</span>
          </button>
        ))}
      </div>
      {current && (
        <p className="text-xs text-muted">
          {current.rows.length}명 · {current.total}문항 · 출제 많은 순
        </p>
      )}
      <div className="max-h-[75vh] overflow-auto">
        <table className="w-auto border-separate border-spacing-[2px] text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-semibold text-muted">사상가</th>
              {years.map((y) => (
                <th key={y} className="px-1 py-1 text-center font-medium tabular-nums text-muted">
                  {String(y).slice(2)}
                </th>
              ))}
              <th className="px-2 py-1 text-center font-semibold text-muted">합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky left-0 whitespace-nowrap bg-surface px-2 py-1">
                  <Link href={`/philosophers/${r.id}`} className="hover:text-navy hover:underline">
                    {r.name}
                  </Link>
                  {!current && <span className="ml-1.5 hidden text-[11px] text-faint sm:inline">{chapterOf.get(r.id)}</span>}
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
                <td className="px-2 text-center font-semibold tabular-nums">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
