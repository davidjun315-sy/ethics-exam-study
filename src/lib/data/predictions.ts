import "server-only";
import { z } from "zod";
import { buildPracticePrompt, PRACTICE_PROMPT_VERSION, PRACTICE_SYSTEM } from "@prompts/practice-question";
import {
  buildPredictionPrompt,
  PREDICTION_PROMPT_VERSION,
  PREDICTION_SYSTEM,
  type PredictionTopicInput,
} from "@prompts/trend-prediction";
import { extractJson, normalize } from "@/lib/ai/lenient";
import { getAIProvider } from "@/lib/ai/provider";
import {
  PracticeQuestionSchema,
  PredictionInterpretationSchema,
  type PracticeQuestion,
  type PredictionInterpretation,
} from "@/lib/ai/schemas";
import { getAdminClient, getReadClient } from "@/lib/supabase/server";
import { formatLabel } from "@/lib/trends/patterns";
import { listQuestionSummaries } from "./queries";
import type { PredictionRun, PredictionTopicRow } from "./trends";

/** AI 에 보낼 관련 기출 요약 (문항 전문 대신 구조화된 분석 결과만) */
async function evidenceBriefs(questionIds: string[]) {
  if (questionIds.length === 0) return [];
  const db = getReadClient();
  const [summaries, intents] = await Promise.all([
    listQuestionSummaries({ ids: questionIds }),
    db.from("question_analysis").select("question_id, intent:details->examinerIntent->summary, formats:details->examinerIntent->formats").in("question_id", questionIds),
  ]);
  const byQ = new Map((intents.data ?? []).map((r) => [r.question_id as string, r as { intent?: string; formats?: string[] }]));
  return summaries.map((s) => ({
    ref: `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " "),
    philosophers: s.philosophers.map((p) => `${p.name}(${p.role})`),
    concepts: s.concepts.map((c) => c.name),
    formats: (byQ.get(s.id)?.formats ?? []).map(formatLabel),
    intent: byQ.get(s.id)?.intent?.slice(0, 220) ?? null,
    answer: s.analysis?.answer?.slice(0, 120) ?? null,
  }));
}

async function loadRun(runId: string) {
  const db = getReadClient();
  const { data: run } = await db.from("prediction_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) throw new Error("예측 실행을 찾을 수 없습니다.");
  const { data: topics } = await db.from("prediction_topics").select("*").eq("run_id", runId).order("rank");
  return { run: run as PredictionRun, topics: (topics ?? []) as PredictionTopicRow[] };
}

async function loadTopic(topicId: string) {
  const { data } = await getReadClient().from("prediction_topics").select("*").eq("id", topicId).maybeSingle();
  if (!data) throw new Error("예상 주제를 찾을 수 없습니다.");
  return data as PredictionTopicRow;
}

function validate<S extends z.ZodType>(schema: S, pasted: string): z.infer<S> {
  const normalized = normalize(z.toJSONSchema(schema) as Parameters<typeof normalize>[0], extractJson(pasted));
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(전체)"}: ${i.message}`)
      .join(" / ");
    throw new Error(`양식이 맞지 않습니다. ${issues}`);
  }
  return parsed.data as z.infer<S>;
}

// ---------------------------------------------------------------------
// 전체 출제 예측 AI 해석
// ---------------------------------------------------------------------

const INTERPRET_TOPICS = 15; // 상위 주제만 AI 에 보낸다 (비용 / context 절약)

async function interpretationPrompt(runId: string): Promise<string> {
  const { run, topics } = await loadRun(runId);
  const top = topics.slice(0, INTERPRET_TOPICS);
  const briefs = await evidenceBriefs([...new Set(top.flatMap((t) => t.evidence_question_ids.slice(0, 4)))]);
  const briefByRef = new Map(briefs.map((b) => [b.ref, b]));
  const summaries = await listQuestionSummaries({ ids: [...new Set(top.flatMap((t) => t.evidence_question_ids.slice(0, 4)))] });
  const refById = new Map(summaries.map((s) => [s.id, `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ")]));
  const input: PredictionTopicInput[] = top.map((t) => ({
    topicKey: t.topic_key,
    title: t.title,
    score: t.score,
    factors: t.factors,
    facts: t.facts,
    dataExpectedFormat: t.expected_format,
    evidence: t.evidence_question_ids
      .slice(0, 4)
      .map((id) => briefByRef.get(refById.get(id) ?? ""))
      .filter((b): b is NonNullable<typeof b> => Boolean(b)),
  }));
  return buildPredictionPrompt({
    yearRange: `${run.year_from ?? "?"}~${run.year_to ?? "?"}학년도`,
    questionCount: run.question_count,
    summary: run.stats as unknown as Record<string, unknown>,
    topics: input,
  });
}

export async function buildInterpretationManualPrompt(runId: string): Promise<string> {
  const prompt = await interpretationPrompt(runId);
  return [
    "<instructions>",
    PREDICTION_SYSTEM,
    "</instructions>",
    "",
    prompt,
    "",
    "출력 형식: 설명 없이 아래 JSON Schema 를 만족하는 JSON 하나만 ```json 코드 블록으로 출력하세요.",
    "<json_schema>",
    JSON.stringify(z.toJSONSchema(PredictionInterpretationSchema)),
    "</json_schema>",
  ].join("\n");
}

async function applyInterpretation(runId: string, d: PredictionInterpretation, meta: { provider: string; model: string; method: "api" | "manual" }) {
  const db = getAdminClient();
  const { topics } = await loadRun(runId);
  const byKey = new Map(topics.map((t) => [t.topic_key, t]));
  let matched = 0;
  for (const t of d.topics) {
    const row = byKey.get(t.topicKey);
    if (!row) continue; // 입력에 없던 주제는 버린다 (AI 가 지어낸 주제 방지)
    matched++;
    await db
      .from("prediction_topics")
      .update({
        ai_title: t.title,
        ai_interpretation: t.interpretation,
        ai_expected_format: t.expectedFormat,
        ai_study_concepts: t.studyConcepts,
        ai_likelihood: t.likelihood,
        ai_cautions: t.cautions,
      })
      .eq("id", row.id);
  }
  if (matched === 0) throw new Error("AI 응답의 topicKey 가 예측 주제와 하나도 맞지 않습니다. 프롬프트를 다시 복사해 시도하세요.");
  await db
    .from("prediction_runs")
    .update({
      ai_output: { overview: d.overview, caveats: d.caveats },
      ai_provider: meta.provider,
      ai_model: meta.model,
      ai_method: meta.method,
      prompt_version: PREDICTION_PROMPT_VERSION,
      ai_at: new Date().toISOString(),
    })
    .eq("id", runId);
  return matched;
}

export async function interpretWithApi(runId: string): Promise<number> {
  const provider = await getAIProvider();
  const res = await provider.interpretPredictions(await interpretationPrompt(runId));
  return applyInterpretation(runId, res.data, { provider: res.provider, model: res.model, method: "api" });
}

export async function importInterpretation(runId: string, pasted: string, source: string): Promise<number> {
  return applyInterpretation(runId, validate(PredictionInterpretationSchema, pasted), { provider: "manual", model: source, method: "manual" });
}

// ---------------------------------------------------------------------
// 예상 연습문제
// ---------------------------------------------------------------------

export interface PracticeRow {
  id: string;
  topic_id: string;
  run_id: string;
  passage: string;
  passage_note: string | null;
  question: string;
  conditions: string[];
  model_answer: string;
  required_keywords: string[];
  scoring_points: string[];
  rationale: string;
  related_question_ids: string[];
  provider: string | null;
  model: string | null;
  created_at: string;
}

async function practicePrompt(topicId: string) {
  const t = await loadTopic(topicId);
  const evidence = await evidenceBriefs(t.evidence_question_ids.slice(0, 5));
  return {
    topic: t,
    evidence,
    prompt: buildPracticePrompt({
      title: t.ai_title ?? t.title,
      expectedFormat: t.ai_expected_format ?? t.expected_format,
      studyConcepts: t.ai_study_concepts?.length ? t.ai_study_concepts : t.study_concepts,
      facts: t.facts,
      evidence,
    }),
  };
}

export async function buildPracticeManualPrompt(topicId: string): Promise<string> {
  const { prompt } = await practicePrompt(topicId);
  return [
    "<instructions>",
    PRACTICE_SYSTEM,
    "</instructions>",
    "",
    prompt,
    "",
    "출력 형식: 설명 없이 아래 JSON Schema 를 만족하는 JSON 하나만 ```json 코드 블록으로 출력하세요.",
    "<json_schema>",
    JSON.stringify(z.toJSONSchema(PracticeQuestionSchema)),
    "</json_schema>",
  ].join("\n");
}

async function savePractice(topicId: string, d: PracticeQuestion, meta: { provider: string; model: string }) {
  const t = await loadTopic(topicId);
  // 관련 기출은 주제의 근거 문항 중 AI 가 고른 것만 (지어낸 번호는 버림)
  const summaries = await listQuestionSummaries({ ids: t.evidence_question_ids });
  const idByRef = new Map(summaries.map((s) => [`${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " "), s.id]));
  const related = d.relatedQuestionRefs.map((r) => idByRef.get(r.replace(/\s+/g, " ").trim())).filter((x): x is string => Boolean(x));
  const { data, error } = await getAdminClient()
    .from("practice_questions")
    .insert({
      topic_id: topicId,
      run_id: t.run_id,
      passage: d.passage,
      passage_note: d.passageNote,
      question: d.question,
      conditions: d.conditions,
      model_answer: d.modelAnswer,
      required_keywords: d.requiredKeywords,
      scoring_points: d.scoringPoints,
      rationale: d.rationale,
      related_question_ids: related.length ? related : t.evidence_question_ids.slice(0, 3),
      provider: meta.provider,
      model: meta.model,
      prompt_version: PRACTICE_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function generatePracticeWithApi(topicId: string): Promise<string> {
  const provider = await getAIProvider();
  const { prompt } = await practicePrompt(topicId);
  const res = await provider.generatePractice(prompt);
  return savePractice(topicId, res.data, { provider: res.provider, model: res.model });
}

export async function importPractice(topicId: string, pasted: string, source: string): Promise<string> {
  return savePractice(topicId, validate(PracticeQuestionSchema, pasted), { provider: "manual", model: source });
}

export async function listPractice(runId: string): Promise<PracticeRow[]> {
  const { data, error } = await getReadClient().from("practice_questions").select("*").eq("run_id", runId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as PracticeRow[];
}
