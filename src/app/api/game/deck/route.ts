import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setDeck } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ ids: z.array(z.string().uuid()).max(3) });

/** 배틀 덱 저장 (보유 카드 id, 대표 카드와 별개) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setDeck(learner, data.ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
