"use client";

import Link from "next/link";
import { useState } from "react";
import type { QuestionDetail, QuestionSummary } from "@/lib/data/queries";
import { isLowConfidence, questionRef } from "@/lib/format";
import { useBoolPref, useQuestionRecord } from "@/lib/local-study";
import { Badge, ConfidenceBadge, Empty, StatusBadge } from "@/components/ui";
import { AnswerSection, PassageTab, RelatedTab, SourcesTab } from "./AnalysisSections";
import { AnswerWriter } from "./AnswerWriter";
import { ConceptsTab, FutureTab, IntentTab } from "./DeepSections";
import { MemoBox, type ServerMemo } from "./MemoBox";
import type { MatchedQuestion } from "@/lib/data/related";
import { DEEP_ANALYSIS_VERSION } from "@/lib/types";

// 공부 흐름: 답안(모범답안·해설) → 출제 의도 → 원문 해설 → 개념 정리(구조도·개념 설명) → 원전 → 향후 출제(예상 문제) → 관련 기출
const TABS = ["답안", "출제 의도", "원문 해설", "개념 정리", "원전", "향후 출제", "관련 기출", "내 메모"] as const;
type TabName = (typeof TABS)[number];


export function QuestionStudy({
  detail,
  related,
  isAdmin,
  extensionMatches,
  memo,
}: {
  detail: QuestionDetail;
  related: (QuestionSummary & { score: number; reasons: string[] })[];
  isAdmin: boolean;
  extensionMatches: MatchedQuestion[][];
  /** 관리자 로그인 시 서버에 저장된 메모 (없으면 null) */
  memo: ServerMemo | null;
}) {
  const { question: q, exam, analysis: a } = detail;
  const refLabel = questionRef(exam, q.label);
  const { record, update } = useQuestionRecord(q.id);
  // 문제 풀이 모드: 기본 ON (정답·해설을 처음부터 보여주지 않음)
  const [solveMode, setSolveMode] = useBoolPref("ees:solve-mode", true);
  const [reveal, setReveal] = useState({ answer: false, analysis: false, source: false });
  const [tab, setTab] = useState<TabName>("답안");
  const [showText, setShowText] = useState(false);

  const showAnalysis = !solveMode || reveal.analysis;
  const showAnswer = !solveMode || reveal.answer || reveal.analysis;
  const showSource = !solveMode || reveal.source || reveal.analysis;

  const idx = detail.siblings.findIndex((s) => s.id === q.id);
  const prev = idx > 0 ? detail.siblings[idx - 1] : null;
  const next = idx >= 0 && idx < detail.siblings.length - 1 ? detail.siblings[idx + 1] : null;
  const mainPhilosophers = detail.philosophers.filter((p) => p.role === "main");
  const needsReview = a?.status === "needs_review" || isLowConfidence(a?.source_confidence);

  function toggleMode() {
    setSolveMode(!solveMode);
    setReveal({ answer: false, analysis: false, source: false });
  }

  const locked = (what: string, key: keyof typeof reveal) => (
    <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
      <p className="text-sm text-muted">문제 풀이 모드입니다. 먼저 문제를 보고 생각해 보세요.</p>
      <button className="btn-primary mt-3" onClick={() => setReveal((r) => ({ ...r, [key]: true }))}>
        {what}
      </button>
    </div>
  );

  function renderTab() {
    switch (tab) {
      case "답안":
        return (
          <div className="space-y-3">
            <AnswerWriter questionId={q.id} refLabel={refLabel} />
            {showAnswer ? <AnswerSection d={detail} /> : locked("모범답안 · 해설 보기", "answer")}
          </div>
        );
      case "출제 의도":
        return showAnalysis ? <IntentTab d={detail} isAdmin={isAdmin} /> : locked("AI 분석 보기", "analysis");
      case "원문 해설":
        return showAnalysis ? <PassageTab d={detail} /> : locked("AI 분석 보기", "analysis");
      case "개념 정리":
        return showAnalysis ? <ConceptsTab d={detail} isAdmin={isAdmin} /> : locked("AI 분석 보기", "analysis");
      case "원전":
        return showSource ? <SourcesTab d={detail} /> : locked("원전 보기", "source");
      case "향후 출제":
        return showAnalysis ? (
          <FutureTab d={detail} isAdmin={isAdmin} matches={extensionMatches} />
        ) : (
          locked("AI 분석 보기", "analysis")
        );
      case "관련 기출":
        return showAnalysis ? <RelatedTab related={related} /> : locked("AI 분석 보기", "analysis");
      case "내 메모":
        return <MemoBox questionId={q.id} refLabel={refLabel} isAdmin={isAdmin} server={memo} />;
    }
  }

  const markBtn = (key: "bookmarked" | "wrong" | "review" | "done", label: string, on: string) => (
    <button
      className={`btn ${record[key] ? on : ""}`}
      onClick={() => update({ [key]: !record[key], ref: refLabel })}
      aria-pressed={Boolean(record[key])}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* 상단 정보 */}
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/exams/${exam.id}`} className="text-sm text-muted hover:text-navy">
            {exam.exam_year}학년도 {exam.section ? `전공 ${exam.section}` : exam.exam_name}
          </Link>
          <span className="text-faint">/</span>
          <h1 className="text-xl font-bold">{q.label}번</h1>
          {q.score !== null && <Badge>{q.score}점</Badge>}
          {q.question_type && <Badge>{q.question_type}</Badge>}
          {showAnalysis && a?.area && <Badge tone="navy">{a.area}</Badge>}
          {showAnalysis && mainPhilosophers.length > 0 && (
            <span className="font-semibold text-navy">{mainPhilosophers.map((p) => p.philosophers.name).join(" · ")}</span>
          )}
          {showAnalysis && a?.difficulty && <Badge>난이도 {a.difficulty}</Badge>}
          <div className="ml-auto flex items-center gap-1">
            {prev && (
              <Link className="btn" href={`/questions/${prev.id}`}>
                ← {prev.label}
              </Link>
            )}
            {next && (
              <Link className="btn" href={`/questions/${next.id}`}>
                {next.label} →
              </Link>
            )}
          </div>
        </div>
        {a && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={a.status} />
            {showAnalysis && (
              <>
                <ConfidenceBadge label="사상가" value={a.philosopher_confidence} />
                <ConfidenceBadge label="개념" value={a.concept_confidence} />
              </>
            )}
            {showAnswer && <ConfidenceBadge label="정답" value={a.answer_confidence} />}
            {showSource && <ConfidenceBadge label="원전" value={a.source_confidence} />}
            <ConfidenceBadge label="전체" value={a.overall_confidence} />
            {needsReview && <Badge tone="warn">⚠ 검토 필요</Badge>}
            {a.edited_fields.length > 0 && <Badge tone="ok">관리자 수정됨</Badge>}
            {isAdmin && (
              <Link href={`/admin/questions/${q.id}`} className="ml-auto text-sm text-navy underline">
                관리자 수정
              </Link>
            )}
          </div>
        )}
        {a && a.review_reasons.length > 0 && showAnalysis && (
          <ul className="mt-2 list-disc pl-5 text-sm text-warn">
            {a.review_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 왼쪽: 원본 문제 */}
        <div className="lg:sticky lg:top-18 lg:max-h-[calc(100vh-5.5rem)] lg:self-start lg:overflow-auto">
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-navy">원본 문제</span>
              <div className="flex gap-1">
                <button className="btn" onClick={() => setShowText((v) => !v)}>
                  {showText ? "이미지 보기" : "텍스트 보기"}
                </button>
                {exam.pdf_url && (
                  <a className="btn" href={`${exam.pdf_url}#page=${q.page_start ?? 1}`} target="_blank" rel="noreferrer">
                    PDF p.{q.page_start ?? 1}
                  </a>
                )}
              </div>
            </div>
            {!showText && q.question_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.question_image_url} alt={`${refLabel} 원본 문제`} className="w-full rounded border border-line bg-white" />
            ) : q.question_text ? (
              <p className="prose-study rounded bg-surface-2 p-3">{q.question_text}</p>
            ) : (
              <Empty>문항 이미지와 텍스트가 없습니다.</Empty>
            )}
          </div>
          {detail.children.length > 0 && (
            <div className="card mt-3 p-3">
              <div className="mb-1 text-sm font-bold">하위 문항</div>
              <div className="flex flex-wrap gap-2">
                {detail.children.map((c) => (
                  <Link key={c.id} href={`/questions/${c.id}`} className="btn">
                    {c.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: AI 분석 */}
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={solveMode} onChange={toggleMode} className="h-4 w-4 accent-[var(--navy)]" />
              문제 풀이 모드
            </label>
            {solveMode && (
              <>
                <button
                  className="btn"
                  onClick={() => {
                    setReveal((r) => ({ ...r, answer: true }));
                    setTab("답안");
                  }}
                >
                  모범답안 보기
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setReveal((r) => ({ ...r, analysis: true }));
                    setTab("답안");
                  }}
                >
                  AI 분석 보기
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setReveal((r) => ({ ...r, source: true }));
                    setTab("원전");
                  }}
                >
                  원전 보기
                </button>
              </>
            )}
          </div>
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1.5 text-sm ${tab === t ? "bg-navy text-white dark:text-[#0f141c]" : "text-muted hover:bg-surface-2"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {a && a.analysis_version < DEEP_ANALYSIS_VERSION && showAnalysis && tab !== "내 메모" && tab !== "관련 기출" && (
            <p className="mb-3 rounded bg-surface-2 px-3 py-2 text-xs text-muted">
              이전 형식으로 분석된 문항입니다. 다시 분석하면 요구 사항별 해설 · 원문 해설 · 개념 구조도 · 원전 해설 · 예상 문제가 채워집니다.
              {isAdmin && (
                <>
                  {" "}
                  <Link href={`/admin/questions/${q.id}`} className="text-navy underline">관리자 화면에서 재분석</Link>
                </>
              )}
            </p>
          )}
          <div className="mb-3">{renderTab()}</div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {markBtn("bookmarked", "★ 북마크", "border-navy text-navy")}
            {markBtn("wrong", "✗ 오답", "border-danger text-danger")}
            {markBtn("review", "↻ 다시 볼 문제", "border-warn text-warn")}
            {markBtn("done", "✓ 학습 완료", "border-ok text-ok")}
          </div>
        </div>
      </div>
    </div>
  );
}
