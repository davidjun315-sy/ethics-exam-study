import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { choosePick, drawWithTicket, getPickOffer, openPack } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

// requestId: 클릭마다 화면이 만드는 값. 같은 값으로 다시 보내면 처음 결과를 돌려주고 뽑기권을 다시 쓰지 않는다
const Body = z.union([
  // 예전 확정 뽑기권 (희귀 확정 · 영웅 확정): 카드 1장
  z.object({ kind: z.enum(["rare", "epic"]), requestId: z.string().uuid() }),
  // 10장권 열기 (일반 10장권 · 희귀 10장권)
  z.object({ action: z.literal("pack"), kind: z.enum(["normal10", "rare10"]), requestId: z.string().uuid() }),
  // 선택권: 후보 10장 보기 (이미 열었으면 같은 후보)
  z.object({ action: z.literal("offer"), kind: z.enum(["rare_pick", "epic_pick"]) }),
  // 선택권: 1장 고르기
  z.object({ action: z.literal("pick"), kind: z.enum(["rare_pick", "epic_pick"]), philosopherId: z.string().uuid(), requestId: z.string().uuid() }),
]);

/** 출석 보상 뽑기권 쓰기 (등급 · 후보 · 지급은 DB 에서 결정) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    if ("action" in data) {
      if (data.action === "pack") return NextResponse.json(await openPack(learner, data.kind, data.requestId));
      if (data.action === "offer") return NextResponse.json(await getPickOffer(learner, data.kind));
      return NextResponse.json(await choosePick(learner, data.kind, data.philosopherId, data.requestId));
    }
    return NextResponse.json(await drawWithTicket(learner, data.kind, data.requestId));
  } catch (e) {
    return gameJsonError(e);
  }
}
