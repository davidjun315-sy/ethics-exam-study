import { NextResponse } from "next/server";
import { requireLearner } from "@/lib/quiz/api";
import { getGameState } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

/** 내 코인 · 보유 카드 · 공개 카드 · 대표 카드 · 덱 */
export async function GET() {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  try {
    return NextResponse.json(await getGameState(learner));
  } catch (e) {
    return gameJsonError(e);
  }
}
