import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { geminiJson, GeminiError } from "@/lib/ai/gemini";
import { validatePasted } from "@/lib/ai/lenient";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { buildChatPrompt, buildEssayPrompt, ESSAY_GRADING_SYSTEM, ESSAY_MAX, ESSAY_MIN, EssayGradingSchema, tidyGrading } from "@/lib/quiz/essay";
import { currentLearner, getQuestionEssayContext } from "@/lib/quiz/learn";
import { FULL_PASS, recordFullSolve } from "@/lib/quiz/full";

// 무료 등급 응답이 느릴 때 예비 모델로 다시 시도할 시간까지 (Gemini 호출 전체 제한은 105초)
export const maxDuration = 120;

const UUID = z.string().uuid();
const Body = z.discriminatedUnion("action", [
  // 서버에서 바로 첨삭 (GEMINI_API_KEY 가 있을 때) — 윤리 퀴즈 서술형과 같은 방식
  z.object({ action: z.literal("ai"), answer: z.string().trim().min(ESSAY_MIN).max(ESSAY_MAX) }),
  // 채팅 AI 에 붙여넣을 프롬프트
  z.object({ action: z.literal("prompt"), answer: z.string().trim().min(ESSAY_MIN).max(ESSAY_MAX) }),
  // 채팅 AI 의 답을 붙여넣음 → 형식 검사
  z.object({ action: z.literal("paste"), pasted: z.string().min(2).max(30000) }),
]);

/**
 * 기출문제 탭: 문항 전체 답안 AI 첨삭 (윤리 퀴즈 서술형 · 완전 기출과 같은 기준 · 같은 AI).
 * 채점 기준(정답·해설)은 서버에서만 프롬프트에 넣고, API 키는 브라우저에 보내지 않는다.
 * 로그인했고 서버 AI 판정이 '완벽하게 맞힘'(또는 80점 이상)이면 정복 지도 기록 (붙여넣은 결과는 기록하지 않음 → 스스로 채점으로).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/questions/[id]/grade">) {
  const { id } = await ctx.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: "문항을 찾을 수 없습니다." }, { status: 400 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  const learner = await currentLearner().catch(() => null);
  try {
    if (data.action === "paste") {
      try {
        return NextResponse.json({ grading: tidyGrading(validatePasted(EssayGradingSchema, data.pasted)) });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
      }
    }
    const context = await getQuestionEssayContext(id);
    if (data.action === "prompt") return NextResponse.json({ prompt: buildChatPrompt(context, data.answer) });

    // 무료 등급 한도를 여러 사람이 나눠 쓰므로 학습자·IP 별로 제한
    if ((learner && !rateLimit(`essay:${learner}`, 30, 60 * 60 * 1000)) || !rateLimit(`essay-ip:${clientKey(req)}`, learner ? 60 : 15, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "AI 채점 요청이 너무 많습니다. 잠시 후 다시 하거나 '채팅 AI로 채점받기'를 이용하세요." }, { status: 429 });
    }
    const { data: g0, model, ms } = await geminiJson(EssayGradingSchema, ESSAY_GRADING_SYSTEM, buildEssayPrompt(context, data.answer));
    const g = tidyGrading(g0);
    const correct = g.verdict === "correct" || g.score >= FULL_PASS;
    const solve = learner ? await recordFullSolve(learner, id, g.score, correct, "ai").catch(() => null) : null;
    return NextResponse.json({ grading: g, model, ms, solve: solve && { ...solve, pass: FULL_PASS } });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return jsonError(e, 400);
  }
}
