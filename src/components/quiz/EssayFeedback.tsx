"use client";

import { useState } from "react";
import { quizApi } from "@/lib/quiz/client";
import type { EssayGrading } from "@/lib/quiz/essay";

export const VERDICT: Record<EssayGrading["verdict"], { label: string; tone: string }> = {
  correct: { label: "완벽하게 맞힘", tone: "bg-ok-soft text-ok" },
  partial: { label: "일부만 맞힘", tone: "bg-warn-soft text-warn" },
  wrong: { label: "틀림", tone: "bg-danger-soft text-danger" },
};

/** AI 첨삭 결과: 판정 제안·점수 → 총평 → 잘 쓴 점 / 빠진 요소 / 고칠 표현 → 고친 답안 */
export function EssayFeedback({ g }: { g: EssayGrading }) {
  const v = VERDICT[g.verdict];
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-navy">AI 첨삭</span>
        <span className={`rounded px-2 py-0.5 text-sm font-bold ${v.tone}`}>{v.label}</span>
        <span className="text-sm tabular-nums text-muted">{g.score}점</span>
      </div>
      {g.summary && <p className="text-[16px] leading-7">{g.summary}</p>}
      {g.strengths.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-ok">잘 쓴 점</div>
          <ul className="list-disc space-y-0.5 pl-5 text-[15px] leading-7">
            {g.strengths.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      )}
      {g.missing.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-warn">빠진 핵심 요소</div>
          <ul className="list-disc space-y-0.5 pl-5 text-[15px] leading-7">
            {g.missing.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </div>
      )}
      {g.errors.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-danger">고칠 표현</div>
          <ul className="space-y-1.5 text-[15px] leading-7">
            {g.errors.map((e, i) => (
              <li key={i}>
                {e.text && <span className="rounded bg-danger-soft px-1 line-through decoration-danger/60">{e.text}</span>} <span className="text-muted">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {g.revisedAnswer && (
        <div className="rounded bg-navy-soft/40 p-3">
          <div className="mb-1 text-xs font-semibold text-navy">내 답안을 고쳐 쓰면</div>
          <p className="whitespace-pre-wrap text-[15px] leading-7">{g.revisedAnswer}</p>
        </div>
      )}
      {g.tip && <p className="text-sm text-muted">요령: {g.tip}</p>}
      <p className="text-[11px] text-faint">AI 첨삭은 기출 분석의 정답·해설을 기준으로 한 참고 의견이며 틀릴 수 있습니다.</p>
    </section>
  );
}

/**
 * 키 없이 무료로: 첨삭 프롬프트를 복사해 채팅 AI(Claude·ChatGPT·Gemini)에 붙여넣고, 받은 답을 다시 붙여넣는다.
 */
export function ChatGrader({ itemId, answer, onGraded }: { itemId: string; answer: string; onGraded: (g: EssayGrading) => Promise<void> }) {
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = answer.trim().length >= 5;
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-line bg-surface-2/50 p-3 text-sm">
      <ol className="list-decimal space-y-0.5 pl-5 text-muted">
        <li>위에 답안을 쓰고 <b>첨삭 프롬프트 복사</b></li>
        <li>Claude · ChatGPT · Gemini 채팅에 붙여넣기</li>
        <li>받은 답(```json …```)을 아래에 붙여넣고 <b>첨삭 보기</b></li>
      </ol>
      <button
        type="button"
        className="btn"
        disabled={!ready || busy}
        onClick={async () => {
          setError(null);
          try {
            const { prompt } = await quizApi<{ prompt: string }>(`/api/quiz/items/${itemId}/grade`, "POST", { action: "prompt", answer });
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        {copied ? "✓ 복사됨" : "첨삭 프롬프트 복사"}
      </button>
      <textarea className="input min-h-24 font-mono text-xs" placeholder="채팅 AI 의 답을 여기에 붙여넣으세요." value={pasted} onChange={(e) => setPasted(e.target.value)} />
      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || pasted.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { grading } = await quizApi<{ grading: EssayGrading }>(`/api/quiz/items/${itemId}/grade`, "POST", { action: "paste", pasted });
            await onGraded(grading);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "확인 중…" : "첨삭 보기"}
      </button>
      {error && <p className="rounded bg-danger-soft p-2 text-danger">{error}</p>}
    </div>
  );
}
