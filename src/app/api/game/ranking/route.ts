import { NextResponse } from "next/server";
import { requireLearner } from "@/lib/quiz/api";
import { getWeeklyRanking } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

/** 이번 주 도장깨기 랭킹 */
export async function GET() {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  try {
    return NextResponse.json(await getWeeklyRanking(learner));
  } catch (e) {
    return gameJsonError(e);
  }
}
