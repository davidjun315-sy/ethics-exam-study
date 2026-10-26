"use client";

import Link from "next/link";
import { useState } from "react";
import type { QuestionDetail, QuestionSummary } from "@/lib/data/queries";
import { isLowConfidence, questionRef } from "@/lib/format";
import { useBoolPref, useQuestionRecord } from "@/lib/local-study";
import { Badge, ConfidenceBadge, Empty, StatusBadge } from "@/components/ui";
import {
  AnswerSection,
  PhilosophersTab,
  ProblemAnalysis,
  RelatedTab,
  SourcesTab,
} from "./AnalysisSections";
import { AnswerWriter } from "./AnswerWriter";
import { FutureTab, IntentTab, StudyConceptsTab } from "./DeepSections";
import type { MatchedQuestion } from "@/lib/data/related";

// 공부 흐름: 왜 이 문제가 나왔나(출제 의도) → 무엇을 알아야 하나(개념 정리) → 풀이·답안 → 어떻게 변형될까(향후 출제)
const TABS = ["출제 의도", "개념 정리", "문제 분석", "사상가", "원전", "답안", "향후 출제", "관련 기출", "내 메모"] as const;
type TabName = (typeof TABS)[number];


export function QuestionStudy({
  detail,
  related,
  isAdmin,
  extensionMatches,
}: {
  detail: QuestionDetail;
  related: (QuestionSummary & { score: number; reasons: string[] })[];
  isAdmin: boolean;
  extensionMatches: MatchedQuestion[][];
}) {
  const { question: q, exam, analysis: a } = detail;
  const refLabel = questionRef(exam, q.label);
  const { record, update } = useQuestionRecord(q.id);
  // 문제 풀이 모드: 기본 ON (정답·해설을 처음부터 보여주지 않음)
  const [solveMode, setSolveMode] = useBoolPref("ees:solve-mode", true);
  const [reveal, setReveal] = useState({ answer: false, analysis: false, source: false });
  const [tab, setTab] = useState<TabName>("출제 의도");
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
      case "출제 의도":
        return showAnalysis ? <IntentTab d={detail} isAdmin={isAdmin} /> : locked("AI 분석 보기", "analysis");
      case "개념 정리":
        return showAnalysis ? <StudyConceptsTab d={detail} isAdmin={isAdmin} /> : locked("AI 분석 보기", "analysis");
      case "향후 출제":
        return showAnalysis ? (
          <FutureTab d={detail} isAdmin={isAdmin} matches={extensionMatches} />
        ) : (
          locked("AI 분석 보기", "analysis")
        );
      case "문제 분석":
        return showAnalysis ? <ProblemAnalysis d={detail} /> : locked("AI 분석 보기", "analysis");
      case "사상가":
        return showAnalysis ? <PhilosophersTab d={detail} /> : locked("AI 분석 보기", "analysis");
      case "원전":
        return showSource ? <SourcesTab d={detail} /> : locked("원전 보기", "source");
      case "답안":
        return (
          <div className="space-y-3">
            <AnswerWriter questionId={q.id} refLabel={refLabel} />
            {showAnswer ? <AnswerSection d={detail} /> : locked("정답 보기", "answer")}
          </div>
        );
      case "관련 기출":
        return showAnalysis ? <RelatedTab related={related} /> : locked("AI 분석 보기", "analysis");
      case "내 메모":
        return <MemoBox questionId={q.id} refLabel={refLabel} />;
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
                  정답 보기
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setReveal((r) => ({ ...r, analysis: true }));
                    setTab("출제 의도");
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

function MemoBox({ questionId, refLabel }: { questionId: string; refLabel: string }) {
  const { record, update } = useQuestionRecord(questionId);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? record.memo ?? "";
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy">내 메모</h3>
        <span className="text-xs text-faint">자동 저장 · 이 브라우저에만 저장됩니다</span>
      </div>
      <textarea
        className="input min-h-48 text-[15px] leading-7"
        placeholder="헷갈렸던 점, 암기할 표현, 비교 포인트 등을 적어 두세요."
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && update({ memo: draft, ref: refLabel })}
      />
    </section>
  );
}
