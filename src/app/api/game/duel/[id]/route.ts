import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { finishDuel } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Uid = z.string().max(20);
const Side = z.enum(["me", "foe"]);
const Target = z.union([z.object({ side: Side, uid: Uid }).strict(), z.object({ side: Side, hero: z.literal(true) }).strict()]);
const Action = z.union([
  z.object({ t: z.literal("play"), uid: Uid, target: Target.optional() }).strict(),
  z.object({ t: z.literal("attack"), attacker: Uid, target: Target }).strict(),
  z.object({ t: z.literal("end") }).strict(),
  z.object({ t: z.literal("concede") }).strict(),
]);
const Body = z.object({ actions: z.array(Action).max(1500) });

/** 논쟁 대전 결과: 내 행동 기록을 보내면 서버가 처음부터 다시 계산해 승패를 확정한다 */
export async function POST(req: Request, ctx: RouteContext<"/api/game/duel/[id]">) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "잘못된 대전 id 입니다." }, { status: 400 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await finishDuel(learner, id, data.actions));
  } catch (e) {
    return gameJsonError(e);
  }
}
