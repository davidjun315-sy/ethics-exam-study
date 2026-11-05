import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { AIConfigError } from "@/lib/ai/provider";
import { interpretWithApi } from "@/lib/data/predictions";
import { invalidating } from "@/lib/cache";

export const maxDuration = 300;

/** 계산된 예측 주제에 AI 해석을 덧붙인다 (API 사용) */
export const POST = invalidating(async function POST(_req: Request, ctx: RouteContext<"/api/admin/predictions/[runId]/interpret">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { runId } = await ctx.params;
  try {
    return NextResponse.json({ matched: await interpretWithApi(runId) });
  } catch (e) {
    if (e instanceof AIConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    return jsonError(e);
  }
});
