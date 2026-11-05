import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { upgradeCard } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ philosopherId: z.string().uuid(), requestId: z.string().uuid() });

/** 강화 (확정 성공, 조각·코인은 서버가 계산) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await upgradeCard(learner, data.philosopherId, data.requestId));
  } catch (e) {
    return gameJsonError(e);
  }
}
