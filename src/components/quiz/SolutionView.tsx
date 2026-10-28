"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Solution } from "@/lib/quiz/learn";

function More({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[15px] font-semibold">
        {title}
        <span className="text-faint transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="border-t border-line px-4 py-3">{children}</div>
    </details>
  );
}

const quote = "rounded border-l-4 border-navy/40 bg-surface-2 px-3 py-2 font-serif text-[15px] leading-7";

/**
 * 정답 확인 후 해설: 정답과 핵심 설명을 먼저, 나머지는 펼쳐 보기.
 * 모든 내용은 기존 기출 분석에서 그대로 가져오며, 비어 있는 항목은 보이지 않는다.
 */
export function SolutionView({ s, kind, showAnswerBox = true }: { s: Solution; kind: "exam" | "expected"; showAnswerBox?: boolean }) {
  const hasConcepts = s.conceptMap.length > 0 || s.studyConcepts.length > 0;
  const hasIntent = Boolean(s.intent.summary || s.intent.item);
  return (
    <div className="space-y-3">
      {showAnswerBox && (
        <section className="rounded-lg border border-navy/30 bg-navy-soft/40 p-4">
          <div className="text-xs font-bold text-navy">정답</div>
          <p className="mt-1 whitespace-pre-wrap text-[17px] font-bold leading-8">{s.answer || "—"}</p>
          {s.accepted.length > 1 && <p className="mt-1 text-xs text-muted">정답으로 인정하는 표현: {s.accepted.join(", ")}</p>}
        </section>
      )}

      {kind === "exam" && s.itemExplanation ? (
        <section className="space-y-2 rounded-lg border border-line bg-surface p-4">
          <div className="text-xs font-bold text-navy">핵심 해설</div>
          {s.itemExplanation.sourcePart && <blockquote className={quote}>{s.itemExplanation.sourcePart}</blockquote>}
          <p className="whitespace-pre-wrap text-[16px] leading-8">{s.itemExplanation.explanation}</p>
        </section>
      ) : kind === "expected" && s.expectedExplanation ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="text-xs font-bold text-navy">해설</div>
          <p className="mt-1 whitespace-pre-wrap text-[16px] leading-8">{s.expectedExplanation}</p>
        </section>
      ) : null}

      {/* 기출: 원래 문항 전체의 모범답안 (예상 문제는 위 정답이 곧 모범답안) */}
      {s.modelAnswer && kind === "exam" && (
        <More title="문항 전체 모범답안">
          <p className="whitespace-pre-wrap text-[15px] leading-8">{s.modelAnswer}</p>
        </More>
      )}

      {s.passageCommentary.length > 0 && (
        <More title="원문 분석">
          <div className="space-y-3">
            {s.passageCommentary.map((p, i) => (
              <div key={i}>
                <div className="mb-1 text-xs font-semibold text-muted">{p.part}</div>
                {p.quote && <blockquote className={`${quote} mb-1`}>{p.quote}</blockquote>}
                <p className="text-[15px] leading-7">{p.commentary}</p>
              </div>
            ))}
          </div>
        </More>
      )}

      {hasConcepts && (
        <More title="문제풀이 개념 정리">
          <div className="space-y-3">
            {s.conceptMap.map((m, i) => (
              <div key={i} className="rounded bg-surface-2 p-3">
                <div className="text-xs text-muted">{m.philosopher}</div>
                <div className="mt-1 font-bold text-navy">
                  {m.focus} <span className="text-sm font-normal text-muted">{m.focusGist}</span>
                </div>
                <ul className="mt-1 space-y-0.5 border-l-2 border-navy/30 pl-3 text-sm">
                  {m.branches.map((b, j) => (
                    <li key={j}>
                      <span className="text-xs text-faint">{b.relation} ─ </span>
                      <b>{b.keyword}</b> <span className="text-muted">{b.gist}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {s.studyConcepts.map((c, i) => (
              <div key={i} className="text-[15px] leading-7">
                <span className="font-bold text-navy">{c.name}</span>
                {c.philosopher && <span className="ml-1 text-xs text-muted">{c.philosopher}</span>}
                <p>{c.definition}</p>
                {c.distinction && <p className="text-sm text-muted">구별: {c.distinction}</p>}
              </div>
            ))}
          </div>
        </More>
      )}

      {hasIntent && (
        <More title="출제자의 의도">
          {s.intent.item && <p className="mb-2 text-[15px] leading-7"><span className="font-semibold text-navy">이 요구 사항: </span>{s.intent.item}</p>}
          {s.intent.summary && <p className="text-[15px] leading-7">{s.intent.summary}</p>}
        </More>
      )}

      {(s.related.length > 0 || s.origin) && (
        <More title="원본 · 관련 기출">
          {s.origin && (
            <Link href={`/questions/${s.origin.questionId}`} className="btn mb-3 inline-block">
              {kind === "exam" ? "원본 기출 보기" : "근거 기출 보기"} · {s.origin.ref}
            </Link>
          )}
          {s.related.length > 0 && (
            <ul className="space-y-1">
              {s.related.map((r) => (
                <li key={r.id}>
                  <Link href={`/questions/${r.id}`} className="text-sm hover:text-navy">
                    <span className="font-semibold">{r.ref}</span> <span className="text-muted">{r.philosophers}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </More>
      )}
      {kind === "exam" && !s.itemExplanation && !s.passageCommentary.length && !hasConcepts && !hasIntent && (
        <p className="text-sm text-faint">이 문항에는 상세 분석 자료가 아직 없습니다.</p>
      )}
    </div>
  );
}
