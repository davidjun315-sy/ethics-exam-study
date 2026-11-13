"use client";

import { useState } from "react";
import { useQuestionRecord } from "@/lib/local-study";
import { quizApi } from "@/lib/quiz/client";
import type { EssayGrading } from "@/lib/quiz/essay";
import { ChatGrader, EssayFeedback } from "@/components/quiz/EssayFeedback";
import { FULL_SOLVE_EVENT, type FullSolveState } from "./FullSolveBox";

/**
 * 내 답안 작성 + AI 첨삭 (윤리 퀴즈 서술형 · 완전 기출과 같은 방식):
 *  - 'AI 채점 받기 (무료)': 서버의 무료 AI (설정돼 있을 때)
 *  - '채팅 AI로 채점받기': 프롬프트를 Claude · ChatGPT · Gemini 에 붙여넣고 답을 다시 붙여넣기 (키 없이)
 * 답안과 첨삭 결과는 이 브라우저에만, 맞힌 기록은 로그인했으면 계정(사상가 정복 지도)에.
 */
export function AnswerWriter({ questionId, refLabel, aiGrading = false }: { questionId: string; refLabel: string; aiGrading?: boolean }) {
  const { record, update } = useQuestionRecord(questionId);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? record.answer ?? "";
  const ready = value.trim().length >= 5;
  const g = record.essay;
  const endpoint = `/api/questions/${questionId}/grade`;

  function saveGrading(grading: EssayGrading) {
    update({ answer: value, solved: true, ref: refLabel, essay: { ...grading, gradedAt: new Date().toISOString() } });
    setChatOpen(false);
  }

  async function gradeWithAi() {
    setBusy(true);
    setError(null);
    update({ answer: value, solved: true, ref: refLabel });
    try {
      const r = await quizApi<{ grading: EssayGrading; solve: FullSolveState | null }>(endpoint, "POST", { action: "ai", answer: value });
      saveGrading(r.grading);
      // 로그인 상태면 서버가 정복 지도 기록을 남겼다 → 상태 상자에 알림
      if (r.solve) window.dispatchEvent(new CustomEvent(FULL_SOLVE_EVENT, { detail: r.solve }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setChatOpen(true); // 무료 한도 초과 등 → 채팅 AI 로 이어서
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy">내 답안 작성</h3>
        <span className="text-xs text-faint">답안은 이 브라우저에만 저장됩니다</span>
      </div>
      <textarea
        className="input min-h-40 font-[inherit] text-[15px] leading-7"
        placeholder="정답을 보기 전에 먼저 답안을 작성해 보세요."
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && update({ answer: draft, ref: refLabel })}
      />
      <div className="mt-2 space-y-2">
        {aiGrading && (
          <button className="btn-primary w-full py-2.5 font-semibold" onClick={gradeWithAi} disabled={busy || !ready}>
            {busy ? "AI가 첨삭하는 중… (길면 1~2분)" : "AI 채점 받기 (무료)"}
          </button>
        )}
        {chatOpen ? (
          <ChatGrader itemId={questionId} endpoint={endpoint} answer={value} onGraded={saveGrading} />
        ) : (
          <button type="button" className={`${aiGrading ? "btn" : "btn-primary font-semibold"} w-full py-2.5`} disabled={busy || !ready} onClick={() => setChatOpen(true)}>
            채팅 AI로 채점받기 (Claude · ChatGPT · Gemini)
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn !min-h-8 !py-1 text-xs" onClick={() => update({ answer: value, solved: true, ref: refLabel })} disabled={!value.trim()}>
            저장
          </button>
          <span className="text-xs text-muted">{value.length}자</span>
          {value.trim().length > 0 && !ready && <span className="text-xs text-faint">AI 첨삭은 5자 이상 쓰면 받을 수 있습니다.</span>}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {g && (
        <div className="mt-4 space-y-1 border-t border-line pt-4">
          <EssayFeedback g={g} />
          <p className="text-right text-[11px] text-faint">{new Date(g.gradedAt).toLocaleString("ko-KR")}</p>
        </div>
      )}
    </section>
  );
}
