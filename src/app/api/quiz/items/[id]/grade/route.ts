import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { geminiJson, GeminiError } from "@/lib/ai/gemini";
import { validatePasted } from "@/lib/ai/lenient";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { buildChatPrompt, buildEssayPrompt, ESSAY_GRADING_SYSTEM, ESSAY_MAX, ESSAY_MIN, EssayGradingSchema, tidyGrading } from "@/lib/quiz/essay";
import { getEssayContext } from "@/lib/quiz/learn";

export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  // 서버에서 바로 첨삭 (GEMINI_API_KEY 가 있을 때)
  z.object({ action: z.literal("ai"), answer: z.string().trim().min(ESSAY_MIN).max(ESSAY_MAX) }),
  // 채팅 AI 에 붙여넣을 프롬프트
  z.object({ action: z.literal("prompt"), answer: z.string().trim().min(ESSAY_MIN).max(ESSAY_MAX) }),
  // 채팅 AI 의 답을 붙여넣음 → 형식 검사
  z.object({ action: z.literal("paste"), pasted: z.string().min(2).max(30000) }),
]);

/**
 * 서술형 답안 AI 첨삭. 판정은 '제안'이며 기록은 학습자의 자기평가로 남는다.
 * 채점 기준(정답·해설)은 서버에서만 프롬프트에 넣고, API 키는 브라우저에 보내지 않는다.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/quiz/items/[id]/grade">) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    if (data.action === "paste") {
      try {
        return NextResponse.json({ grading: tidyGrading(validatePasted(EssayGradingSchema, data.pasted)) });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
      }
    }
    const context = await getEssayContext(id);
    if (data.action === "prompt") return NextResponse.json({ prompt: buildChatPrompt(context, data.answer) });

    // 무료 등급 한도를 여러 사람이 나눠 쓰므로 학습자·IP 별로 제한
    if (!rateLimit(`essay:${learner}`, 30, 60 * 60 * 1000) || !rateLimit(`essay-ip:${clientKey(req)}`, 60, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "AI 채점 요청이 너무 많습니다. 잠시 후 다시 하거나 '채팅 AI로 채점받기'를 이용하세요." }, { status: 429 });
    }
    const { data: g, model } = await geminiJson(EssayGradingSchema, ESSAY_GRADING_SYSTEM, buildEssayPrompt(context, data.answer));
    return NextResponse.json({ grading: tidyGrading(g), model });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return jsonError(e, 400);
  }
}
