"use client";

import { useStudyState } from "@/lib/local-study";

/** 문항 카드에 내 학습 상태(북마크 / 오답 / 완료)를 표시 */
export function LocalMarks({ questionId }: { questionId: string }) {
  const r = useStudyState().questions[questionId];
  if (!r) return null;
  return (
    <span className="flex gap-1 text-xs">
      {r.bookmarked && <span title="북마크" className="text-navy">★</span>}
      {r.wrong && <span title="오답" className="text-danger">✗</span>}
      {r.review && <span title="다시 볼 문제" className="text-warn">↻</span>}
      {r.done && <span title="학습 완료" className="text-ok">✓</span>}
    </span>
  );
}
