"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quizApi as api } from "@/lib/quiz/client";
import { SCOPE_NAMES, type QuestionScope } from "@/lib/quiz/srs";

const ORDER: QuestionScope[] = ["exam", "expected", "both"];

/** 출제 범위 선택 · 변경: 오늘의 미션과 오답 복습에 낼 문제 종류 */
export function ScopePicker({ current, counts }: { current: QuestionScope | null; counts?: { exam: number; expected: number } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<QuestionScope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const help: Record<QuestionScope, string> = {
    exam: counts ? `실제 기출 ${counts.exam}문제` : "실제 기출만",
    expected: counts ? `AI 예상 ${counts.expected}문제` : "AI 예상 문제만",
    both: counts ? `${counts.exam + counts.expected}문제 섞어서` : "둘 다 섞어서",
  };
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy !== null}
            aria-pressed={current === k}
            onClick={async () => {
              if (current === k) return;
              setBusy(k);
              setError(null);
              try {
                await api("/api/quiz/profile", "POST", { scope: k });
                startTransition(() => router.refresh());
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(null);
              }
            }}
            className={`rounded-lg border p-3 text-left transition-colors ${current === k ? "border-navy bg-navy-soft" : "border-line hover:border-navy/50"}`}
          >
            <div className={`font-bold ${current === k ? "text-navy" : ""}`}>{busy === k ? "…" : SCOPE_NAMES[k]}</div>
            <div className="text-[11px] text-muted">{help[k]}</div>
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
