import "server-only";
import { createHash } from "node:crypto";
import type { FutureExtension, QuestionFormat, StudyConcept } from "@/lib/ai/schemas";
import { getAdminClient, getReadClient } from "@/lib/supabase/server";
import { analyzePatterns, type PassageInfo, type PatternResult, type QuestionFacts } from "@/lib/trends/patterns";
import { buildTopics, SCORING_VERSION, type Topic } from "@/lib/trends/scoring";
import { listQuestionSummaries } from "./queries";
import { one } from "./shape";

/**
 * 전체 기출 통합 분석 데이터 로더.
 * PDF 를 다시 읽지 않고, 이미 저장된 문항별 구조화 분석(question_analysis + 연결 테이블)만 사용한다.
 */

const ANALYZED = new Set(["analyzed", "needs_review", "verified"]);

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadFacts(): Promise<{ facts: QuestionFacts[]; passages: PassageInfo[]; known: Map<string, Set<string>> }> {
  const db = getReadClient();
  const [summaries, analysisRows, conceptLinks, sourceLinks, passages, conceptPhil] = await Promise.all([
    listQuestionSummaries(),
    db
      .from("question_analysis")
      .select(
        "question_id, status, formats:details->examinerIntent->formats, studyConcepts:details->studyConcepts, ext:details->futureExtensions, confusable:details->confusablePhilosophers",
      )
      .limit(5000),
    db.from("question_concepts").select("question_id, concept_id, philosopher_id").limit(20000),
    db.from("question_sources").select("question_id, source_id, location, quoted_text, sources(title)").not("source_id", "is", null).limit(20000),
    db.from("source_passages").select("source_id, volume, chapter, section").limit(5000),
    db.from("concept_philosophers").select("concepts(name), philosophers(name)").limit(20000),
  ]);
  for (const r of [analysisRows, conceptLinks, sourceLinks, passages, conceptPhil]) if (r.error) throw new Error(r.error.message);

  const analysis = new Map((analysisRows.data ?? []).map((a: any) => [a.question_id as string, a]));
  const conceptOwner = new Map((conceptLinks.data ?? []).map((r: any) => [`${r.question_id}:${r.concept_id}`, r.philosopher_id as string | null]));
  const srcByQ = new Map<string, QuestionFacts["sources"]>();
  for (const r of (sourceLinks.data ?? []) as any[]) {
    const list = srcByQ.get(r.question_id) ?? [];
    list.push({ id: r.source_id, title: one<any>(r.sources)?.title ?? "", location: r.location, quoted: r.quoted_text });
    srcByQ.set(r.question_id, list);
  }

  const facts: QuestionFacts[] = [];
  for (const s of summaries) {
    const a = analysis.get(s.id);
    if (!a || !ANALYZED.has(a.status)) continue;
    const studyConcepts = (Array.isArray(a.studyConcepts) ? a.studyConcepts : []) as StudyConcept[];
    const ext = (Array.isArray(a.ext) ? a.ext : []) as FutureExtension[];
    facts.push({
      id: s.id,
      ref: `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " "),
      year: s.exam.exam_year,
      section: s.exam.section,
      questionType: s.question_type,
      area: s.analysis?.area ?? null,
      philosophers: s.philosophers,
      concepts: s.concepts.map((c) => ({ ...c, philosopherId: conceptOwner.get(`${s.id}:${c.id}`) ?? null })),
      sources: srcByQ.get(s.id) ?? [],
      formats: (Array.isArray(a.formats) ? a.formats : []) as QuestionFormat[],
      studyConcepts: studyConcepts.map((c) => ({ name: c.name, philosopher: c.philosopher })),
      extensions: ext.map((e) => ({
        topic: e.topic,
        format: e.format,
        relatedConcepts: e.relatedConcepts ?? [],
        relatedPhilosophers: e.relatedPhilosophers ?? [],
      })),
      confusablePhilosophers: ((Array.isArray(a.confusable) ? a.confusable : []) as { name: string }[]).map((c) => c.name),
    });
  }

  // 사상가별 "알려진 주요 개념": 개념-사상가 연결 + 문항 분석의 개념 정리(사상가 표시) + 확장 출제의 관련 개념
  const known = new Map<string, Set<string>>();
  const addKnown = (p: string | null | undefined, c: string) => {
    if (!p || !c) return;
    known.set(p.trim(), (known.get(p.trim()) ?? new Set()).add(c.trim()));
  };
  for (const r of (conceptPhil.data ?? []) as any[]) addKnown(one<any>(r.philosophers)?.name, one<any>(r.concepts)?.name);
  for (const f of facts) {
    f.studyConcepts.forEach((c) => c.philosopher && addKnown(c.philosopher, c.name));
    f.extensions.forEach((e) => e.relatedPhilosophers.length === 1 && e.relatedConcepts.forEach((c) => addKnown(e.relatedPhilosophers[0], c)));
  }

  const passageInfo: PassageInfo[] = ((passages.data ?? []) as any[])
    .map((p) => ({ sourceId: p.source_id, location: [p.volume, p.chapter, p.section].filter(Boolean).join(" ") }))
    .filter((p) => p.location);
  return { facts, passages: passageInfo, known };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getPatterns(): Promise<{ patterns: PatternResult; facts: QuestionFacts[] }> {
  const { facts, passages, known } = await loadFacts();
  return { patterns: analyzePatterns(facts, passages, known), facts };
}

/**
 * 데이터 지문: 분석 완료 문항 수 + 분석/연결 데이터의 마지막 수정 시각.
 * 지난 예측 실행과 다르면 "전체 분석 업데이트 필요".
 */
export async function getDataFingerprint(): Promise<string> {
  const db = getReadClient();
  const [a, e, qp, qc, qs] = await Promise.all([
    db.from("question_analysis").select("updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1),
    db.from("exams").select("updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1),
    db.from("question_philosophers").select("created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1),
    db.from("question_concepts").select("created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1),
    db.from("question_sources").select("created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1),
  ]);
  const parts = [a, e, qp, qc, qs].map((r) => {
    const row = (r.data?.[0] ?? {}) as { updated_at?: string; created_at?: string };
    return `${r.count ?? 0}:${row.updated_at ?? row.created_at ?? ""}`;
  });
  return createHash("sha256").update(`${SCORING_VERSION}|${parts.join("|")}`).digest("hex").slice(0, 24);
}

// ---------------------------------------------------------------------
// 예측 실행 (prediction_runs / prediction_topics)
// ---------------------------------------------------------------------

export interface PredictionRun {
  id: string;
  created_at: string;
  fingerprint: string;
  year_from: number | null;
  year_to: number | null;
  exam_count: number;
  question_count: number;
  scoring_version: string;
  stats: PatternSummary;
  ai_provider: string | null;
  ai_model: string | null;
  ai_method: string | null;
  prompt_version: string | null;
  ai_output: { overview?: string; caveats?: string[] } | null;
  ai_at: string | null;
}

export interface PredictionTopicRow {
  id: string;
  run_id: string;
  rank: number;
  topic_key: string;
  kind: string;
  title: string;
  philosopher_ids: string[];
  concept_ids: string[];
  source_ids: string[];
  score: number;
  factors: Topic["factors"];
  facts: Topic["facts"];
  evidence_question_ids: string[];
  expected_format: string;
  study_concepts: string[];
  ai_title: string | null;
  ai_interpretation: string | null;
  ai_expected_format: string | null;
  ai_study_concepts: string[];
  ai_likelihood: string | null;
  ai_cautions: string[];
}

/** 예측 실행에 함께 저장하는 패턴 요약 (어떤 데이터로 계산했는지 추적용) */
export interface PatternSummary {
  analyzedCount: number;
  years: number[];
  topPhilosophers: { name: string; total: number; recent5: number; lastYear: number | null }[];
  rising: string[];
  declining: string[];
  cycles: string[];
  topPairs: string[];
  formats: { label: string; count: number }[];
}

export function summarizePatterns(p: PatternResult): PatternSummary {
  return {
    analyzedCount: p.global.analyzedCount,
    years: p.global.window.years,
    topPhilosophers: p.philosophers.slice(0, 15).map((x) => ({ name: x.name, total: x.total, recent5: x.recent5, lastYear: x.lastYear })),
    rising: p.global.rising.slice(0, 10).map((x) => `${x.name} (최근 3년 ${x.recent3}회, 이전 ${x.before}회)`),
    declining: p.global.declining.slice(0, 10).map((x) => `${x.name} (${x.before}회, 마지막 ${x.lastYear})`),
    cycles: p.global.cycles.slice(0, 10).map((x) => `${x.name}: ${x.cycle} (${x.years.join(", ")})`),
    topPairs: p.global.comparisonPairs.slice(0, 10).map((x) => `${x.a}·${x.b} ${x.total}회 (${x.years.join(", ")})`),
    formats: p.global.formatCounts.map((f) => ({ label: f.label, count: f.count })),
  };
}

export async function getLatestRun(): Promise<{ run: PredictionRun; topics: PredictionTopicRow[] } | null> {
  const db = getReadClient();
  const { data: run, error } = await db.from("prediction_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) return null;
  const { data: topics } = await db.from("prediction_topics").select("*").eq("run_id", run.id).order("rank");
  return { run: run as PredictionRun, topics: (topics ?? []) as PredictionTopicRow[] };
}

/** 패턴 + 점수만으로 새 예측 실행을 만든다. (AI 호출 없음, 무료) */
export async function createPredictionRun(): Promise<string> {
  const [{ patterns, facts }, fingerprint] = await Promise.all([getPatterns(), getDataFingerprint()]);
  if (facts.length === 0) throw new Error("분석 완료된 문항이 없습니다. 먼저 문항 분석을 진행하세요.");
  const topics = buildTopics(patterns, facts, { limit: 30 });
  const db = getAdminClient();
  const years = patterns.global.window.years;
  const examIds = new Set<string>();
  const { data: qRows } = await db.from("questions").select("exam_id").in("id", facts.map((f) => f.id));
  (qRows ?? []).forEach((r) => examIds.add(r.exam_id as string));
  const { data: run, error } = await db
    .from("prediction_runs")
    .insert({
      fingerprint,
      year_from: years[0] ?? null,
      year_to: years.at(-1) ?? null,
      exam_count: examIds.size,
      exam_ids: [...examIds],
      question_count: facts.length,
      scoring_version: SCORING_VERSION,
      stats: summarizePatterns(patterns),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (topics.length) {
    const { error: tErr } = await db.from("prediction_topics").insert(
      topics.map((t, i) => ({
        run_id: run.id,
        rank: i + 1,
        topic_key: t.key,
        kind: t.kind,
        title: t.title,
        philosopher_ids: t.philosopherIds,
        concept_ids: t.conceptIds,
        source_ids: t.sourceIds,
        score: t.score,
        factors: t.factors,
        facts: t.facts,
        evidence_question_ids: t.evidenceQuestionIds,
        expected_format: t.expectedFormat,
        study_concepts: t.studyConcepts,
      })),
    );
    if (tErr) throw new Error(tErr.message);
  }
  return run.id as string;
}
