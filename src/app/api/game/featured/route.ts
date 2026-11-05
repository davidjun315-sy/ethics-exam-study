import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setFeatured } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ philosopherId: z.string().uuid().nullable() });

/** 대표 카드 설정 (보유 카드만, 한 장) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setFeatured(learner, data.philosopherId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
