import "server-only";
import { z } from "zod";
import { buildManualAnalysisPrompt } from "@prompts/manual-analysis";
import { extractJson, normalize } from "@/lib/ai/lenient";
import { DeepAnalysisSchema, FullAnalysisSchema } from "@/lib/ai/schemas";
import { examFullLabel } from "@/lib/format";
import { getAdminClient } from "@/lib/supabase/server";
import type { Exam, Question, QuestionAnalysis } from "@/lib/types";
import { saveDeepAnalysisForManual, saveFullAnalysisForManual } from "./analysis";

/** full = 전체 분석, deep = 출제 의도 / 개념 정리 / 향후 출제만 (기존 분석에 덧붙임) */
export type ManualMode = "full" | "deep";

const schemaFor = (mode: ManualMode) => (mode === "deep" ? DeepAnalysisSchema : FullAnalysisSchema);
const jsonSchema = (mode: ManualMode) => z.toJSONSchema(schemaFor(mode));

async function loadQuestion(questionId: string) {
  const db = getAdminClient();
  const { data, error } = await db.from("questions").select("*, exams(*)").eq("id", questionId).single();
  if (error || !data) throw new Error("문항을 찾을 수 없습니다.");
  const { exams, ...question } = data as Question & { exams: Exam };
  const { data: analysis } = await db.from("question_analysis").select("*").eq("question_id", questionId).maybeSingle();
  return { question: question as Question, exam: exams, analysis: analysis as QuestionAnalysis | null };
}

function summarize(a: QuestionAnalysis | null): string | null {
  if (!a || a.status === "pending") return null;
  return [
    `영역: ${a.area ?? "-"}`,
    `정답: ${a.answer ?? "-"}`,
    a.question_intent ? `요구하는 것: ${a.question_intent}` : "",
    a.answer_explanation ? `해설 요약: ${a.answer_explanation.slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 채팅 AI 에 붙여넣을 분석 프롬프트 */
export async function buildManualPrompt(
  questionId: string,
  mode: ManualMode = "full",
): Promise<{ prompt: string; imageUrl: string | null }> {
  const { question, exam, analysis } = await loadQuestion(questionId);
  const prompt = buildManualAnalysisPrompt(
    {
      examLabel: examFullLabel(exam),
      questionLabel: question.label,
      score: question.score,
      questionText: question.question_text,
      hasImage: Boolean(question.question_image_url),
    },
    jsonSchema(mode),
    question.question_image_url,
    mode === "deep" ? { existingSummary: summarize(analysis) } : undefined,
  );
  return { prompt, imageUrl: question.question_image_url };
}

/** 채팅 AI 가 돌려준 JSON 을 검증해 API 분석과 똑같이 저장한다. */
export async function importManualAnalysis(
  questionId: string,
  pasted: string,
  source: string,
  mode: ManualMode = "full",
): Promise<{ textUpdated: boolean }> {
  const raw = extractJson(pasted);
  const schema = schemaFor(mode);
  const normalized = normalize(jsonSchema(mode) as Parameters<typeof normalize>[0], raw);
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(전체)"}: ${i.message}`)
      .join(" / ");
    throw new Error(`분석 양식이 맞지 않습니다. ${issues}`);
  }
  if (mode === "deep") {
    await saveDeepAnalysisForManual(questionId, DeepAnalysisSchema.parse(parsed.data), source);
    return { textUpdated: false };
  }
  const { question } = await loadQuestion(questionId);
  return saveFullAnalysisForManual(question, FullAnalysisSchema.parse(parsed.data), source);
}
