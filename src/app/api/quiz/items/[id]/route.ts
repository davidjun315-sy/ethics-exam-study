import { NextResponse } from "next/server";
import { jsonError } from "@/lib/admin-guard";
import { requireLearner } from "@/lib/quiz/api";
import { getItemView } from "@/lib/quiz/learn";

/** 풀이 화면: 원문과 세부 발문 (정답·해설 없음) */
export async function GET(_req: Request, ctx: RouteContext<"/api/quiz/items/[id]">) {
  const { denied } = await requireLearner();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await getItemView(id));
  } catch (e) {
    return jsonError(e, 404);
  }
}
