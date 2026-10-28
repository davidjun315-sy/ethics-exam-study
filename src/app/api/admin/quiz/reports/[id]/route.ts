import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { resolveReport } from "@/lib/quiz/bank";

const Body = z.object({ action: z.enum(["accept", "reject"]) });

/** 오답 검수 요청 처리 */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/quiz/reports/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await resolveReport(id, data.action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
