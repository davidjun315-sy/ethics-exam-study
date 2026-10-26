import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { buildPracticeManualPrompt, importPractice } from "@/lib/data/predictions";
import { parseBody } from "@/lib/http";

/** 채팅 AI 에 붙여넣을 연습문제 생성 프롬프트 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/predictions/topics/[topicId]/practice/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { topicId } = await ctx.params;
  try {
    return NextResponse.json({ prompt: await buildPracticeManualPrompt(topicId) });
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({ text: z.string().min(2).max(100000), source: z.string().max(50).optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/predictions/topics/[topicId]/practice/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { topicId } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json({ id: await importPractice(topicId, data.text, data.source?.trim() || "채팅 AI") });
  } catch (e) {
    return jsonError(e, 400);
  }
}
