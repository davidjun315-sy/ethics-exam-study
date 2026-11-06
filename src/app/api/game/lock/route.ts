import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setLocked } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ cardId: z.string().uuid(), locked: z.boolean() });

/** 카드 잠금 (잠긴 카드는 합성 재료·조각 전환에 쓰이지 않음) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setLocked(learner, data.cardId, data.locked);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
