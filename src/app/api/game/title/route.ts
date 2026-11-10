import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setTitle } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({ title: z.string().min(1).max(40).nullable() });

/** 칭호 고르기 (달성한 업적의 칭호만, 서버가 확인) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setTitle(learner, data.title);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
