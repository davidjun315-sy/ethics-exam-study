import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { requireLearner } from "@/lib/quiz/api";
import { saveMemo } from "@/lib/data/memos";
import { parseBody } from "@/lib/http";

const Body = z.object({ memo: z.string().max(50000) });

/** 내 메모 저장 (빈 값이면 삭제) */
export async function PUT(req: Request, ctx: RouteContext<"/api/memos/[questionId]">) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { questionId } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json({ memo: await saveMemo(learner, questionId, data.memo) });
  } catch (e) {
    return jsonError(e, 400);
  }
}
