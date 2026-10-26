import "server-only";
import { z } from "zod";
import { buildManualAnalysisPrompt } from "@prompts/manual-analysis";
import { extractJson, normalize } from "@/lib/ai/lenient";
import { FullAnalysisSchema } from "@/lib/ai/schemas";
import { examFullLabel } from "@/lib/format";
import { getAdminClient } from "@/lib/supabase/server";
import type { Exam, Question } from "@/lib/types";
import { saveFullAnalysisForManual } from "./analysis";

const jsonSchema = () => z.toJSONSchema(FullAnalysisSchema);

async function loadQuestion(questionId: string) {
  const db = getAdminClient();
  const { data, error } = await db.from("questions").select("*, exams(*)").eq("id", questionId).single();
  if (error || !data) throw new Error("문항을 찾을 수 없습니다.");
  const { exams, ...question } = data as Question & { exams: Exam };
  return { question: question as Question, exam: exams };
}

/** 채팅 AI 에 붙여넣을 분석 프롬프트 */
export async function buildManualPrompt(questionId: string): Promise<{ prompt: string; imageUrl: string | null }> {
  const { question, exam } = await loadQuestion(questionId);
  const prompt = buildManualAnalysisPrompt(
    {
      examLabel: examFullLabel(exam),
      questionLabel: question.label,
      score: question.score,
      questionText: question.question_text,
      hasImage: Boolean(question.question_image_url),
    },
    jsonSchema(),
    question.question_image_url,
  );
  return { prompt, imageUrl: question.question_image_url };
}

/** 채팅 AI 가 돌려준 JSON 을 검증해 API 분석과 똑같이 저장한다. */
export async function importManualAnalysis(questionId: string, pasted: string, source: string): Promise<{ textUpdated: boolean }> {
  const raw = extractJson(pasted);
  const normalized = normalize(jsonSchema() as Parameters<typeof normalize>[0], raw);
  const parsed = FullAnalysisSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(전체)"}: ${i.message}`)
      .join(" / ");
    throw new Error(`분석 양식이 맞지 않습니다. ${issues}`);
  }
  const { question } = await loadQuestion(questionId);
  return saveFullAnalysisForManual(question, parsed.data, source);
}
