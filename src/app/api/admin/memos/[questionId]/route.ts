import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { saveMemo } from "@/lib/data/memos";
import { parseBody } from "@/lib/http";

const Body = z.object({ memo: z.string().max(50000) });

/** 내 메모 저장 (빈 값이면 삭제) */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/memos/[questionId]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { questionId } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json({ memo: await saveMemo(questionId, data.memo) });
  } catch (e) {
    return jsonError(e, 400);
  }
}
