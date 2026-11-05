import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { drawCard } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

// requestId: 화면이 클릭마다 만드는 값. 같은 값으로 다시 보내면(새로고침·재시도) 처음 결과를 돌려주고 다시 차감하지 않는다
const Body = z.object({ requestId: z.string().uuid() });

/** 카드 1회 뽑기 (확률·결과는 DB 에서 결정) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await drawCard(learner, data.requestId));
  } catch (e) {
    return gameJsonError(e);
  }
}
