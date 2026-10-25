"use client";

import Link from "next/link";
import { useState } from "react";
import { clearStudyData, exportStudyData, importStudyData, useStudyState, type QuestionRecord } from "@/lib/local-study";
import { Empty, StatCard } from "@/components/ui";

const FILTERS: { key: keyof QuestionRecord | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "bookmarked", label: "북마크" },
  { key: "wrong", label: "오답" },
  { key: "review", label: "다시 볼 문제" },
  { key: "done", label: "학습 완료" },
  { key: "solved", label: "푼 문제" },
  { key: "memo", label: "메모" },
];

export function MyStudy() {
  const state = useStudyState();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const entries = Object.entries(state.questions).sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? ""));
  const shown = filter === "all" ? entries : entries.filter(([, r]) => Boolean(r[filter]));
  const count = (k: keyof QuestionRecord) => entries.filter(([, r]) => Boolean(r[k])).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="푼 문제" value={count("solved")} />
        <StatCard label="북마크" value={count("bookmarked")} />
        <StatCard label="오답" value={count("wrong")} />
        <StatCard label="다시 볼 문제" value={count("review")} />
        <StatCard label="학습 완료" value={count("done")} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? "btn-primary" : "btn"} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([exportStudyData()], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `ethics-study-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            내보내기
          </button>
          <label className="btn cursor-pointer">
            가져오기
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importStudyData(await f.text());
                  setMsg("가져오기 완료");
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          </label>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm("이 브라우저의 학습 기록을 모두 지울까요? 되돌릴 수 없습니다.")) clearStudyData();
            }}
          >
            초기화
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      {shown.length === 0 ? (
        <Empty>기록이 없습니다. 문항 화면에서 북마크·오답 표시·답안 작성을 하면 여기에 모입니다.</Empty>
      ) : (
        <ul className="card divide-y divide-line">
          {shown.map(([id, r]) => (
            <li key={id}>
              <Link href={`/questions/${id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="font-semibold">{r.ref ?? "문항"}</span>
                <span className="flex gap-1.5 text-xs">
                  {r.bookmarked && <span className="text-navy">★ 북마크</span>}
                  {r.wrong && <span className="text-danger">✗ 오답</span>}
                  {r.review && <span className="text-warn">↻ 다시 보기</span>}
                  {r.done && <span className="text-ok">✓ 완료</span>}
                  {r.grading && <span className="text-muted">AI 채점 {Math.round(r.grading.overallScore)}점</span>}
                </span>
                {r.memo && <span className="line-clamp-1 flex-1 text-sm text-muted">{r.memo}</span>}
                <span className="ml-auto text-xs text-faint">{r.updatedAt ? new Date(r.updatedAt).toLocaleDateString("ko-KR") : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
