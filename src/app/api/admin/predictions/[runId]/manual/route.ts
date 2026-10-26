import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { buildInterpretationManualPrompt, importInterpretation } from "@/lib/data/predictions";
import { parseBody } from "@/lib/http";

/** 채팅 AI 에 붙여넣을 출제 예측 해석 프롬프트 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/predictions/[runId]/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { runId } = await ctx.params;
  try {
    return NextResponse.json({ prompt: await buildInterpretationManualPrompt(runId) });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({ text: z.string().min(2).max(300000), source: z.string().max(50).optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/predictions/[runId]/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { runId } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json({ matched: await importInterpretation(runId, data.text, data.source?.trim() || "채팅 AI") });
  } catch (e) {
    return jsonError(e, 400);
  }
}
