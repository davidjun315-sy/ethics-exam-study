import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { cardToShards } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ cardId: z.string().uuid() });

/** 카드 한 장 → 같은 사상가 강화 조각 (카드는 소모) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await cardToShards(learner, data.cardId));
  } catch (e) {
    return gameJsonError(e);
  }
}
