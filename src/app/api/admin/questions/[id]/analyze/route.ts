import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { AIConfigError } from "@/lib/ai/provider";
import { runAnalysis } from "@/lib/data/analysis";
import { parseBody } from "@/lib/http";

// AI 분석은 오래 걸릴 수 있다. (Vercel: 최대 300초)
export const maxDuration = 300;

const Body = z.object({
  scope: z.enum(["full", "answer", "philosophers", "sources", "explanation", "deep"]),
  force: z.boolean().optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/admin/questions/[id]/analyze">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const result = await runAnalysis(id, data.scope, data.force ?? false);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AIConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    return jsonError(e);
  }
}
