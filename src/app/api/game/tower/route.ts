import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { gameJsonError } from "@/lib/game/api";
import { answerTower, chooseTowerBuff, getTower, quitTower, startTower, spendTowerHint } from "@/lib/game/tower-data";
import { GeminiError } from "@/lib/ai/gemini";

// 서술형 층은 AI 채점 (무료 등급이 느리면 예비 모델로 다시)
export const maxDuration = 120;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), cardIds: z.array(z.string().uuid()).min(1).max(3) }),
  z.object({ action: z.literal("answer"), runId: z.string().uuid(), itemId: z.string().uuid(), answer: z.string().max(5000) }),
  z.object({ action: z.literal("buff"), runId: z.string().uuid(), buff: z.enum(["heal", "power", "shield", "hint"]) }),
  z.object({ action: z.literal("hint"), runId: z.string().uuid() }),
  z.object({ action: z.literal("quit"), runId: z.string().uuid() }),
]);

/** 사상의 탑: 지금 상태 (도전 횟수 · 최고 층 · 진행 중인 도전 · 주간 랭킹) */
export async function GET() {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  try {
    return NextResponse.json(await getTower(learner));
  } catch (e) {
    return gameJsonError(e);
  }
}

/** 사상의 탑: 시작 · 답 · 강화 고르기 · 힌트 · 그만두기 (판정과 보상은 모두 서버) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    switch (data.action) {
      case "start":
        return NextResponse.json({ run: await startTower(learner, data.cardIds) });
      case "answer":
        if (!rateLimit(`tower:${learner}`, 240, 60 * 60 * 1000) || !rateLimit(`tower-ip:${clientKey(req)}`, 480, 60 * 60 * 1000)) {
          return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 하세요." }, { status: 429 });
        }
        return NextResponse.json(await answerTower(learner, data.runId, data.itemId, data.answer));
      case "buff":
        return NextResponse.json({ run: await chooseTowerBuff(learner, data.runId, data.buff) });
      case "hint":
        return NextResponse.json({ run: await spendTowerHint(learner, data.runId) });
      case "quit":
        await quitTower(learner, data.runId);
        return NextResponse.json({ ok: true });
    }
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return gameJsonError(e);
  }
}
