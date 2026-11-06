"use client";

import Link from "next/link";
import { useState } from "react";
import { AiPasteBox } from "./AiPasteBox";

/** 이 기출로 연습문제(② 원문 해석 · ⑤ 채점 요소) 만들기 — 채팅 AI 붙여넣기 */
export function PracticeAiPanel({ questionId }: { questionId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="text-base font-bold">연습문제 만들기 · 원문 해석 / 채점 요소</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          빈칸 고르기·초성 힌트·근거 구절·입장 분류·감점 포인트는 문제은행 동기화 때 자동으로 만들어집니다. 여기서는 규칙으로 만들기 어려운
          <b> 원문 해석(그럴듯한 오답 해석)</b>과 <b>서술형 채점 요소</b> 문제를 채팅 AI 로 만듭니다. 프롬프트에는 이 기출의 저장된 분석만 들어가며, 결과는 승인 대기로 저장됩니다.
        </p>
      </div>
      <AiPasteBox
        promptUrl={`/api/admin/quiz/practice-ai?questionId=${questionId}`}
        submitUrl={`/api/admin/quiz/practice-ai?questionId=${questionId}`}
        copyLabel="연습문제 프롬프트 복사"
        onSaved={(_, r) => {
          const x = r as { saved: number; skipped: string[] } | undefined;
          setMsg(x ? `연습문제 ${x.saved}개를 승인 대기로 저장했습니다.${x.skipped.length ? ` 제외: ${x.skipped.join(" / ")}` : ""}` : "저장했습니다.");
        }}
      />
      {msg && (
        <p className="rounded bg-ok-soft p-2 text-sm text-ok">
          {msg} <Link href="/admin/quiz?tab=items&kind=practice&status=pending" className="underline">검수하러 가기</Link>
        </p>
      )}
    </section>
  );
}
