import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { playBattle } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ deck: z.array(z.string().uuid()).length(3), difficulty: z.enum(["easy", "normal", "hard"]) });

/** 3 vs 3 자동 배틀: 서버가 결과를 정하고 기록을 돌려준다 (화면은 재생). 보상 없음 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  if (!rateLimit(`battle:${learner}:${clientKey(req)}`, 60, 60 * 60 * 1000)) return NextResponse.json({ error: "배틀 요청이 너무 많습니다. 잠시 후 다시 하세요." }, { status: 429 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await playBattle(learner, data.deck, data.difficulty));
  } catch (e) {
    return gameJsonError(e);
  }
}
