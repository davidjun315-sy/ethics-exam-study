import { NextResponse } from "next/server";
import { jsonError } from "@/lib/admin-guard";
import { requireLearner } from "@/lib/quiz/api";
import { getSolution } from "@/lib/quiz/learn";

/** 정답 및 해설 (기존 기출 분석을 그때그때 읽음) */
export async function GET(_req: Request, ctx: RouteContext<"/api/quiz/items/[id]/solution">) {
  const { denied } = await requireLearner();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await getSolution(id));
  } catch (e) {
    return jsonError(e, 404);
  }
}
