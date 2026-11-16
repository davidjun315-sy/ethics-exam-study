import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { drawWithTicket } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

// requestId: 클릭마다 화면이 만드는 값. 같은 값으로 다시 보내면 처음 결과를 돌려주고 뽑기권을 다시 쓰지 않는다
const Body = z.object({ kind: z.enum(["rare", "epic"]), requestId: z.string().uuid() });

/** 확정 뽑기권으로 카드 1장 (등급 · 사상가는 DB 에서 결정) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await drawWithTicket(learner, data.kind, data.requestId));
  } catch (e) {
    return gameJsonError(e);
  }
}
