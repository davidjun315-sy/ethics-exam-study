import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { updateQuizItem } from "@/lib/quiz/bank";

const Body = z.object({
  label: z.string().max(100).optional(),
  format: z.enum(["fill", "essay"]).optional(),
  grading: z.enum(["auto", "self"]).optional(),
  prompt: z.string().max(5000).nullable().optional(),
  passage: z.string().max(20000).nullable().optional(),
  answer: z.string().max(5000).nullable().optional(),
  accepted_answers: z.array(z.string().max(200)).max(50).optional(),
  model_answer: z.string().max(10000).nullable().optional(),
  explanation: z.string().max(10000).nullable().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  area: z.string().max(50).nullable().optional(),
  status: z.enum(["pending", "approved", "hidden"]).optional(),
  clearChanged: z.boolean().optional(),
  clearReasons: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/quiz/items/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await updateQuizItem(id, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
