import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider, type QuestionInput } from "@/lib/ai/provider";
import {
  clamp01,
  type FullAnalysis,
  type ConceptFindingSchema,
  type PhilosopherFindingSchema,
  type SourceFindingSchema,
} from "@/lib/ai/schemas";
import { examFullLabel, LOW_CONFIDENCE, normalizeTitle } from "@/lib/format";
import { getAdminClient } from "@/lib/supabase/server";
import type { AnalysisDetails, AnalysisScope, Exam, Question, QuestionAnalysis } from "@/lib/types";
import type { z } from "zod";
import { linkConceptPhilosopher, upsertConcept, upsertPhilosopher, upsertSource } from "./tags";

type PhilosopherFinding = z.infer<typeof PhilosopherFindingSchema>;
type ConceptFinding = z.infer<typeof ConceptFindingSchema>;
type SourceFinding = z.infer<typeof SourceFindingSchema>;

export interface RunAnalysisResult {
  status: "analyzed" | "skipped";
  message: string;
}

async function loadContext(db: SupabaseClient, questionId: string) {
  const { data: q, error } = await db.from("questions").select("*, exams(*)").eq("id", questionId).single();
  if (error || !q) throw new Error("문항을 찾을 수 없습니다.");
  const { exams, ...question } = q as Question & { exams: Exam };
  const { data: analysis } = await db.from("question_analysis").select("*").eq("question_id", questionId).maybeSingle();
  return { question: question as Question, exam: exams, analysis: analysis as QuestionAnalysis | null };
}

function toInput(question: Question, exam: Exam): QuestionInput {
  return {
    examLabel: examFullLabel(exam),
    questionLabel: question.label,
    score: question.score,
    questionText: question.question_text,
    hasImage: Boolean(question.question_image_url),
    imageUrl: question.question_image_url,
  };
}

/** 검토 필요 여부: AI 가 표시했거나, 원전/전체 확신도가 낮을 때 */
function decideStatus(opts: {
  needsReview: boolean;
  sourceConfidence: number | null;
  overallConfidence: number | null;
  reasons: string[];
}): { status: "analyzed" | "needs_review"; reasons: string[] } {
  const reasons = [...opts.reasons];
  if (opts.sourceConfidence !== null && opts.sourceConfidence < LOW_CONFIDENCE) reasons.push("원전 확신도가 낮음");
  if (opts.overallConfidence !== null && opts.overallConfidence < LOW_CONFIDENCE) reasons.push("전체 분석 확신도가 낮음");
  const unique = [...new Set(reasons)];
  return { status: opts.needsReview || unique.length > 0 ? "needs_review" : "analyzed", reasons: unique };
}

async function replacePhilosophers(db: SupabaseClient, questionId: string, items: PhilosopherFinding[]) {
  await db.from("question_philosophers").delete().eq("question_id", questionId).eq("is_manual", false);
  const { data: manual } = await db.from("question_philosophers").select("philosopher_id").eq("question_id", questionId);
  const manualIds = new Set((manual ?? []).map((m) => m.philosopher_id));
  const nameToId = new Map<string, string>();
  for (const p of items) {
    if (!p.name?.trim()) continue;
    const id = await upsertPhilosopher(db, p);
    nameToId.set(p.name.trim(), id);
    if (manualIds.has(id)) continue;
    manualIds.add(id);
    await db.from("question_philosophers").insert({
      question_id: questionId,
      philosopher_id: id,
      role: p.role,
      confidence: clamp01(p.confidence),
      reasoning: {
        decisiveExpressions: p.decisiveExpressions,
        similarPhilosophers: p.similarPhilosophers,
        reasoning: p.reasoning,
      },
    });
  }
  return nameToId;
}

async function replaceConcepts(
  db: SupabaseClient,
  questionId: string,
  items: ConceptFinding[],
  philosopherIds: Map<string, string>,
) {
  await db.from("question_concepts").delete().eq("question_id", questionId).eq("is_manual", false);
  const { data: manual } = await db.from("question_concepts").select("concept_id").eq("question_id", questionId);
  const seen = new Set((manual ?? []).map((m) => m.concept_id));
  for (const c of items) {
    if (!c.name?.trim()) continue;
    const id = await upsertConcept(db, c);
    const pid = c.philosopher ? (philosopherIds.get(c.philosopher.trim()) ?? null) : null;
    if (pid) await linkConceptPhilosopher(db, id, pid);
    if (seen.has(id)) continue;
    seen.add(id);
    await db.from("question_concepts").insert({
      question_id: questionId,
      concept_id: id,
      philosopher_id: pid,
      confidence: clamp01(c.confidence),
    });
  }
}

async function replaceSources(db: SupabaseClient, questionId: string, items: SourceFinding[]) {
  await db.from("question_sources").delete().eq("question_id", questionId).eq("is_manual", false);
  for (const s of items) {
    let sourceId: string | null = null;
    // 원전명이 있고 unknown 이 아닐 때만 원전 마스터에 등록한다.
    if (s.title && s.title.trim() && s.status !== "unknown") {
      const pid = s.philosopher ? await upsertPhilosopher(db, { name: s.philosopher }) : null;
      sourceId = await upsertSource(db, { title: s.title, philosopherId: pid });
    }
    await db.from("question_sources").insert({
      question_id: questionId,
      source_id: sourceId,
      philosopher_name: s.philosopher,
      title_raw: s.title ? normalizeTitle(s.title) : null,
      location: s.location,
      related_content: s.relatedContent,
      relation_to_question: s.relationToQuestion,
      quoted_text: s.quotedText,
      // AI 는 confirmed 를 주장할 수 있지만, 원전 DB 와 대조되지 않은 경우 likely 로 낮춘다.
      verification_status: s.status === "confirmed" ? "likely" : s.status,
      confidence: clamp01(s.confidence),
      reasoning:
        s.status === "confirmed"
          ? `${s.reasoning} (AI 는 확인됨으로 판단했으나 원전 DB 와 대조되지 않아 '유력'으로 저장됨)`
          : s.reasoning,
    });
  }
}

function summarizeExisting(a: QuestionAnalysis | null, philosophers: string[], concepts: string[]): string | null {
  if (!a) return null;
  return [
    `영역: ${a.area ?? "-"}`,
    `사상가: ${philosophers.join(", ") || "-"}`,
    `개념: ${concepts.join(", ") || "-"}`,
    `정답: ${a.answer ?? "-"}`,
  ].join("\n");
}

async function logRun(
  db: SupabaseClient,
  row: {
    question_id: string;
    scope: AnalysisScope;
    provider?: string;
    model?: string;
    status: "success" | "error";
    input_tokens?: number | null;
    output_tokens?: number | null;
    raw_output?: unknown;
    error?: string;
  },
) {
  await db.from("analysis_runs").insert(row);
}

/** 전체 분석 결과를 저장한다. (AI API 분석 / 채팅 AI 붙여넣기 공용) */
async function saveFullAnalysis(
  db: SupabaseClient,
  question: Question,
  d: FullAnalysis,
  meta: { provider: string; model: string; usage: { inputTokens: number | null; outputTokens: number | null } },
) {
  const c = d.confidence;
  const { status, reasons } = decideStatus({
    needsReview: d.needsReview,
    sourceConfidence: clamp01(c.source),
    overallConfidence: clamp01(c.overall),
    reasons: d.reviewReasons,
  });
  const details: AnalysisDetails = {
    keyClues: d.keyClues,
    passageAnalysis: d.passageAnalysis,
    solvingProcess: d.solvingProcess,
    answerBasis: d.answerBasis,
    subAnswers: d.subAnswers,
    modelAnswer: d.modelAnswer,
    scoringPoints: d.scoringPoints,
    recommendedExpressions: d.recommendedExpressions,
    deductionRisks: d.deductionRisks,
    confusablePhilosophers: d.confusablePhilosophers,
    confusableConcepts: d.confusableConcepts,
    mistakeReasons: d.mistakeReasons,
    relatedThinkers: d.relatedThinkers,
  };
  const { error } = await db.from("question_analysis").upsert(
    {
      question_id: question.id,
      area: d.area,
      school: d.school,
      era: d.era,
      question_type: d.questionType,
      difficulty: d.difficulty,
      answer: d.answer,
      answer_explanation: d.explanation,
      question_intent: d.questionIntent,
      required_keywords: d.requiredKeywords,
      common_mistakes: d.commonMistakes,
      details,
      philosopher_confidence: clamp01(c.philosopher),
      answer_confidence: clamp01(c.answer),
      source_confidence: clamp01(c.source),
      concept_confidence: clamp01(c.concept),
      overall_confidence: clamp01(c.overall),
      status,
      review_reasons: reasons,
      ai_original: d,
      edited_fields: [],
      edited_at: null,
      provider: meta.provider,
      model: meta.model,
    },
    { onConflict: "question_id" },
  );
  if (error) throw new Error(error.message);

  const ids = await replacePhilosophers(db, question.id, d.philosophers);
  await replaceConcepts(db, question.id, d.concepts, ids);
  await replaceSources(db, question.id, d.sources);

  const qPatch: Record<string, unknown> = {};
  // AI 가 이미지에서 읽은 원문이 기존 텍스트보다 확실히 길면(그림으로 들어간 제시문이 빠져 있던 경우) 교체한다.
  const existing = question.question_text?.trim() ?? "";
  const transcribed = d.transcribedText?.trim() ?? "";
  const textUpdated = transcribed.length > 0 && (existing.length === 0 || transcribed.length >= existing.length * 1.3);
  if (textUpdated) qPatch.question_text = transcribed;
  if (!question.question_type && d.questionType) qPatch.question_type = d.questionType;
  if (Object.keys(qPatch).length) await db.from("questions").update(qPatch).eq("id", question.id);

  await logRun(db, {
    question_id: question.id,
    scope: "full",
    provider: meta.provider,
    model: meta.model,
    status: "success",
    input_tokens: meta.usage.inputTokens,
    output_tokens: meta.usage.outputTokens,
    raw_output: d,
  });
  return { textUpdated };
}

/**
 * 문항 AI 분석 실행.
 * - 이미 분석된 문항은 force 없이는 다시 분석하지 않는다. (비용 절감)
 * - scope 로 특정 부분만 재분석할 수 있다.
 */
export async function runAnalysis(questionId: string, scope: AnalysisScope, force = false): Promise<RunAnalysisResult> {
  const db = getAdminClient();
  const { question, exam, analysis } = await loadContext(db, questionId);

  if (scope === "full" && analysis && analysis.status !== "pending" && analysis.status !== "error" && !force) {
    return { status: "skipped", message: "이미 분석된 문항입니다. 재분석하려면 '전체 재분석'을 사용하세요." };
  }
  if (scope !== "full" && (!analysis || analysis.status === "pending")) {
    throw new Error("먼저 전체 분석을 실행하세요.");
  }
  if (!question.question_text?.trim() && !question.question_image_url) {
    throw new Error("문항 텍스트와 이미지가 모두 없습니다. 문항 분리를 먼저 확인하세요.");
  }

  const provider = await getAIProvider();
  const input = toInput(question, exam);

  try {
    if (scope === "full") {
      const res = await provider.analyzeQuestion(input);
      const { textUpdated } = await saveFullAnalysis(db, question, res.data, { provider: res.provider, model: res.model, usage: res.usage });
      return {
        status: "analyzed",
        message: `분석이 완료되었습니다.${textUpdated ? " AI 가 이미지에서 읽은 전체 원문으로 문항 텍스트를 채웠습니다." : ""}`,
      };
    }

    // ---- 부분 재분석 ----
    const a = analysis!;
    const { data: pl } = await db.from("question_philosophers").select("philosophers(name)").eq("question_id", questionId);
    const { data: cl } = await db.from("question_concepts").select("concepts(name)").eq("question_id", questionId);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const pNames = (pl ?? []).map((x: any) => (Array.isArray(x.philosophers) ? x.philosophers[0]?.name : x.philosophers?.name)).filter(Boolean);
    const cNames = (cl ?? []).map((x: any) => (Array.isArray(x.concepts) ? x.concepts[0]?.name : x.concepts?.name)).filter(Boolean);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const existingSummary = summarizeExisting(a, pNames, cNames);
    const original = (a.ai_original ?? {}) as Record<string, unknown>;
    let patch: Record<string, unknown> = {};
    let raw: unknown;
    let usage = { inputTokens: null as number | null, outputTokens: null as number | null };
    let meta = { provider: provider.name, model: provider.model };
    let review = { needsReview: false, reasons: [] as string[] };
    let sourceConfidence = a.source_confidence;

    if (scope === "answer") {
      const res = await provider.reanalyzePart(input, "answer", existingSummary);
      const d = res.data;
      raw = d;
      usage = res.usage;
      meta = res;
      review = { needsReview: d.needsReview, reasons: d.reviewReasons };
      patch = {
        answer: d.answer,
        required_keywords: d.requiredKeywords,
        answer_confidence: clamp01(d.answerConfidence),
        details: { ...a.details, subAnswers: d.subAnswers, answerBasis: d.answerBasis, modelAnswer: d.modelAnswer, scoringPoints: d.scoringPoints },
        ai_original: { ...original, ...d },
      };
    } else if (scope === "philosophers") {
      const res = await provider.reanalyzePart(input, "philosophers", existingSummary);
      const d = res.data;
      raw = d;
      usage = res.usage;
      meta = res;
      review = { needsReview: d.needsReview, reasons: d.reviewReasons };
      const ids = await replacePhilosophers(db, questionId, d.philosophers);
      await replaceConcepts(db, questionId, d.concepts, ids);
      patch = {
        philosopher_confidence: clamp01(d.philosopherConfidence),
        concept_confidence: clamp01(d.conceptConfidence),
        details: { ...a.details, relatedThinkers: d.relatedThinkers, confusablePhilosophers: d.confusablePhilosophers },
        ai_original: { ...original, ...d },
      };
    } else if (scope === "sources") {
      // 원전 DB 에 등록된 원문이 있으면 함께 제공해 대조하게 한다.
      // (이 문항에 연결된 원전 + 이 문항 사상가들의 원전)
      const [{ data: linked }, { data: qp }] = await Promise.all([
        db.from("question_sources").select("source_id").eq("question_id", questionId).not("source_id", "is", null),
        db.from("question_philosophers").select("philosopher_id").eq("question_id", questionId),
      ]);
      const pIds = (qp ?? []).map((x) => x.philosopher_id as string);
      const { data: byPhilosopher } = pIds.length
        ? await db.from("sources").select("id").in("philosopher_id", pIds)
        : { data: [] as { id: string }[] };
      const ids = [...new Set([...(linked ?? []).map((x) => x.source_id as string), ...(byPhilosopher ?? []).map((x) => x.id)])];
      const { data: passages } = ids.length
        ? await db.from("source_passages").select("chapter, volume, original_text, translation, sources(title)").in("source_id", ids).limit(20)
        : { data: [] };
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const known = (passages ?? []).map((p: any) => ({
        title: (Array.isArray(p.sources) ? p.sources[0]?.title : p.sources?.title) ?? "",
        location: [p.volume, p.chapter].filter(Boolean).join(" ") || null,
        text: [p.original_text, p.translation].filter(Boolean).join("\n"),
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const res = await provider.analyzeSource(input, known);
      const d = res.data;
      raw = d;
      usage = res.usage;
      meta = res;
      review = { needsReview: d.needsReview, reasons: d.reviewReasons };
      await replaceSources(db, questionId, d.sources);
      sourceConfidence = clamp01(d.sourceConfidence);
      patch = { source_confidence: sourceConfidence, ai_original: { ...original, sources: d.sources } };
    } else if (scope === "explanation") {
      const res = await provider.reanalyzePart(input, "explanation", existingSummary);
      const d = res.data;
      raw = d;
      usage = res.usage;
      meta = res;
      patch = {
        question_intent: d.questionIntent,
        answer_explanation: d.explanation,
        common_mistakes: d.commonMistakes,
        details: {
          ...a.details,
          keyClues: d.keyClues,
          passageAnalysis: d.passageAnalysis,
          solvingProcess: d.solvingProcess,
          recommendedExpressions: d.recommendedExpressions,
          deductionRisks: d.deductionRisks,
          confusableConcepts: d.confusableConcepts,
          mistakeReasons: d.mistakeReasons,
        },
        ai_original: { ...original, ...d },
      };
    }

    const decided = decideStatus({
      needsReview: review.needsReview,
      sourceConfidence,
      overallConfidence: a.overall_confidence,
      reasons: review.reasons,
    });
    // 검수 완료된 문항은 상태를 유지한다.
    if (a.status !== "verified") {
      patch.status = decided.status;
      patch.review_reasons = decided.reasons;
    }
    patch.provider = meta.provider;
    patch.model = meta.model;
    const { error } = await db.from("question_analysis").update(patch).eq("question_id", questionId);
    if (error) throw new Error(error.message);
    await logRun(db, {
      question_id: questionId,
      scope,
      provider: meta.provider,
      model: meta.model,
      status: "success",
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      raw_output: raw,
    });
    return { status: "analyzed", message: "부분 재분석이 완료되었습니다." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(db, { question_id: questionId, scope, provider: provider.name, model: provider.model, status: "error", error: message });
    if (scope === "full" && !analysis) {
      await db.from("question_analysis").upsert(
        { question_id: questionId, status: "error", review_reasons: [message] },
        { onConflict: "question_id" },
      );
    }
    throw err;
  }
}

/** 채팅 AI 결과 붙여넣기 저장 (lib/data/manual.ts 에서 사용) */
export async function saveFullAnalysisForManual(question: Question, d: FullAnalysis, source: string) {
  return saveFullAnalysis(getAdminClient(), question, d, {
    provider: "manual",
    model: source,
    usage: { inputTokens: null, outputTokens: null },
  });
}
