import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { AIConfigError } from "@/lib/ai/provider";
import { generatePracticeWithApi } from "@/lib/data/predictions";

export const maxDuration = 300;

/** 예상 주제로 새 연습문제 생성 (API 사용) */
export async function POST(_req: Request, ctx: RouteContext<"/api/admin/predictions/topics/[topicId]/practice">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { topicId } = await ctx.params;
  try {
    return NextResponse.json({ id: await generatePracticeWithApi(topicId) });
  } catch (e) {
    if (e instanceof AIConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    return jsonError(e);
  }
}
