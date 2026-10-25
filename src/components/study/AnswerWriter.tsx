"use client";

import { useState } from "react";
import { useQuestionRecord } from "@/lib/local-study";
import { Badge } from "@/components/ui";

/** 내 답안 작성 + AI 채점. 답안과 채점 결과는 이 브라우저의 localStorage 에만 저장된다. */
export function AnswerWriter({ questionId, refLabel }: { questionId: string; refLabel: string }) {
  const { record, update } = useQuestionRecord(questionId);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? record.answer ?? "";
  const g = record.grading;

  async function grade() {
    setLoading(true);
    setError(null);
    update({ answer: value, solved: true, ref: refLabel });
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "채점 실패");
      update({ grading: { ...json.grading, gradedAt: new Date().toISOString() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy">내 답안 작성</h3>
        <span className="text-xs text-faint">이 브라우저에만 저장됩니다</span>
      </div>
      <textarea
        className="input min-h-40 font-[inherit] text-[15px] leading-7"
        placeholder="정답을 보기 전에 먼저 답안을 작성해 보세요."
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && update({ answer: draft, ref: refLabel })}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => update({ answer: value, solved: true, ref: refLabel })} disabled={!value.trim()}>
          저장
        </button>
        <button className="btn-primary" onClick={grade} disabled={loading || value.trim().length < 5}>
          {loading ? "AI 채점 중…" : "AI 채점"}
        </button>
        <span className="text-xs text-muted">{value.length}자</span>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>

      {g && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold text-navy">{Math.round(g.overallScore)}점</span>
            <Badge>개념 정확성 {Math.round(g.conceptAccuracy.score)}</Badge>
            <Badge>완성도 {Math.round(g.completeness.score)}</Badge>
            <span className="text-xs text-faint">{new Date(g.gradedAt).toLocaleString("ko-KR")}</span>
          </div>
          <p className="prose-study">{g.overallComment}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-muted">핵심 개념 정확성</div>
              <p className="text-[15px]">{g.conceptAccuracy.comment}</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted">답안 완성도</div>
              <p className="text-[15px]">{g.completeness.comment}</p>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">필수 키워드</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.keywordCoverage.included.map((k) => (
                <Badge key={`i-${k}`} tone="ok">✓ {k}</Badge>
              ))}
              {g.keywordCoverage.missing.map((k) => (
                <Badge key={`m-${k}`} tone="danger">✗ {k}</Badge>
              ))}
            </div>
          </div>
          {g.wrongExpressions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted">틀린 표현</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px]">
                {g.wrongExpressions.map((w, i) => (
                  <li key={i}>
                    “{w.text}” — {w.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {g.missingContent.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted">빠진 내용</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px]">
                {g.missingContent.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {g.suggestedRevisions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted">수정할 표현</div>
              <ul className="mt-1 space-y-1 text-[15px]">
                {g.suggestedRevisions.map((s, i) => (
                  <li key={i}>
                    <span className="text-danger line-through">{s.original}</span> → <span className="text-ok">{s.revised}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-muted">예상 답안</div>
            <p className="prose-study">{g.expectedAnswer}</p>
          </div>
        </div>
      )}
    </section>
  );
}
