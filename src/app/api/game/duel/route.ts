import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { startDuel } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ difficulty: z.enum(["easy", "normal", "hard"]) });

/** 논쟁 대전 시작: 서버가 덱(대전용 카드 스냅샷)과 시드를 정해 준다. 보상 없음 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  if (!rateLimit(`duel:${learner}:${clientKey(req)}`, 60, 60 * 60 * 1000)) return NextResponse.json({ error: "대전 요청이 너무 많습니다. 잠시 후 다시 하세요." }, { status: 429 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await startDuel(learner, data.difficulty));
  } catch (e) {
    return gameJsonError(e);
  }
}
