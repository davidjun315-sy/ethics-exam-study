import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { drawCard } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

// requestId: 화면이 클릭마다 만드는 값. 같은 값으로 다시 보내면(새로고침·재시도) 처음 결과를 돌려주고 다시 차감하지 않는다
// free: 계정당 최초 1회 무료 뽑기 요청. 비용은 서버(DB 함수)가 정하며 무료 여부도 DB 기록으로 확인한다
const Body = z.object({ requestId: z.string().uuid(), free: z.boolean().optional() });

/** 카드 1회 뽑기 (등급·사상가는 DB 에서 결정) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await drawCard(learner, data.requestId, data.free === true));
  } catch (e) {
    return gameJsonError(e);
  }
}
