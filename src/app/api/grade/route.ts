import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, jsonError } from "@/lib/admin-guard";
import { AIConfigError, getAIProvider } from "@/lib/ai/provider";
import { serverEnv } from "@/lib/env";
import { examFullLabel } from "@/lib/format";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { getReadClient } from "@/lib/supabase/server";
import type { Exam, Question, QuestionAnalysis } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({ questionId: z.string().uuid(), answer: z.string().min(5).max(5000) });

/**
 * 내 답안 AI 채점. 답안은 서버에 저장하지 않는다. (기록은 브라우저 localStorage 에만)
 * 공개 기능이므로 IP 별 호출 횟수를 제한한다. PUBLIC_AI_GRADING=false 이면 관리자만 사용 가능.
 */
export async function POST(req: Request) {
  const admin = await isAdmin();
  if (!serverEnv.publicAiGrading() && !admin) {
    return NextResponse.json({ error: "AI 채점은 관리자만 사용할 수 있도록 설정되어 있습니다." }, { status: 403 });
  }
  if (!admin && !rateLimit(`grade:${clientKey(req)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "AI 채점 요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getReadClient();
    const { data: q } = await db.from("questions").select("*, exams(*)").eq("id", data.questionId).maybeSingle();
    if (!q) return NextResponse.json({ error: "문항을 찾을 수 없습니다." }, { status: 404 });
    const { exams, ...question } = q as Question & { exams: Exam };
    const { data: a } = await db.from("question_analysis").select("*").eq("question_id", data.questionId).maybeSingle();
    const analysis = a as QuestionAnalysis | null;
    const provider = await getAIProvider();
    const res = await provider.gradeAnswer(
      {
        examLabel: examFullLabel(exams),
        questionLabel: question.label,
        score: question.score,
        questionText: question.question_text,
        hasImage: Boolean(question.question_image_url),
        imageUrl: question.question_image_url,
      },
      analysis
        ? {
            answer: analysis.answer,
            modelAnswer: analysis.details?.modelAnswer ?? null,
            requiredKeywords: analysis.required_keywords ?? [],
          }
        : null,
      data.answer,
    );
    return NextResponse.json({ grading: res.data, model: res.model });
  } catch (e) {
    if (e instanceof AIConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    return jsonError(e);
  }
}
