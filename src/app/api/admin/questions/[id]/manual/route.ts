import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { buildManualPrompt, importManualAnalysis } from "@/lib/data/manual";
import { parseBody } from "@/lib/http";

/** 채팅 AI 에 붙여넣을 분석 프롬프트 */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/questions/[id]/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode") === "deep" ? "deep" : "full";
  try {
    return NextResponse.json(await buildManualPrompt(id, mode));
  } catch (e) {
    return jsonError(e);
  }
}

const Body = z.object({
  text: z.string().min(2).max(200000),
  source: z.string().max(50).optional(),
  mode: z.enum(["full", "deep"]).optional(),
});

/** 채팅 AI 결과(JSON) 붙여넣기 → 검증 후 저장 */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/questions/[id]/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const r = await importManualAnalysis(id, data.text, data.source?.trim() || "채팅 AI", data.mode ?? "full");
    return NextResponse.json({ ok: true, textUpdated: r.textUpdated });
  } catch (e) {
    return jsonError(e, 400);
  }
}
