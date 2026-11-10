import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { spendStones } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ philosopherId: z.string().uuid(), count: z.number().int().min(1).max(999) });

/** 공용 강화석 → 고른 사상가의 강화 조각 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await spendStones(learner, data.philosopherId, data.count));
  } catch (e) {
    return gameJsonError(e);
  }
}
