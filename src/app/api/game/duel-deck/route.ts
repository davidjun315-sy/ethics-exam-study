import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setDuelDeck } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ ids: z.array(z.string().uuid()).max(20) });

/** 논쟁 대전 덱 저장 (보유 카드 id, 빈 목록 = 자동) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setDuelDeck(learner, data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
