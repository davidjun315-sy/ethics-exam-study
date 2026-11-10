import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { playStage } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ stage: z.string().uuid(), deck: z.array(z.string().uuid()).length(3) });

/** 사상가 도장깨기: 내 배틀 덱 3장 vs 관 보스 (서버가 자동 배틀 결과를 정하고 기록을 돌려줌) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  if (!rateLimit(`stage:${learner}:${clientKey(req)}`, 120, 60 * 60 * 1000)) return NextResponse.json({ error: "도전 요청이 너무 많습니다. 잠시 후 다시 하세요." }, { status: 429 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await playStage(learner, data.stage, data.deck));
  } catch (e) {
    return gameJsonError(e);
  }
}
