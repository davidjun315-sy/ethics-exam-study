"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 서버에서 그린 목록을 브라우저에서 바로 거른다.
 * target 안의 [data-search] 요소 중 검색어가 없는 것을 숨기고, 보이는 항목이 없는 [data-group] 도 숨긴다.
 */
export function SearchFilter({ target, placeholder }: { target: string; placeholder: string }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    const root = document.getElementById(target);
    if (!root) return;
    const needle = q.trim().toLowerCase().replace(/\s+/g, "");
    let n = 0;
    root.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
      const hit = !needle || (el.dataset.search ?? "").toLowerCase().replace(/\s+/g, "").includes(needle);
      el.hidden = !hit;
      if (hit) n++;
    });
    root.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => {
      g.hidden = Boolean(needle) && !g.querySelector("[data-search]:not([hidden])");
    });
    // 검색 결과 수 표시 (외부 DOM 과 동기화하는 효과라 여기서 갱신)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(needle ? n : null);
  }, [q, target]);
  return (
    <div className="relative mb-4">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input !rounded-xl !py-2.5 pl-9 pr-20" aria-label={placeholder} />
      <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-faint">
        {shown !== null && <span>{shown}건</span>}
        {q && (
          <button type="button" onClick={() => setQ("")} className="rounded p-0.5 hover:text-ink" aria-label="검색어 지우기">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </span>
    </div>
  );
}
