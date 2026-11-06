import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { fuseCards } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

// requestId: 같은 값으로 다시 보내면(새로고침·재시도) 처음 결과를 돌려주고 다시 소모하지 않는다
const Body = z.object({ baseId: z.string().uuid(), materialIds: z.array(z.string().uuid()).min(1).max(4), requestId: z.string().uuid() });

/** 합성(진화): 같은 등급 카드 → 기준 카드가 한 단계 위 등급 (확정, 조건은 DB 함수가 확인) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await fuseCards(learner, data.baseId, data.materialIds, data.requestId));
  } catch (e) {
    return gameJsonError(e);
  }
}
