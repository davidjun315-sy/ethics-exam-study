import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { recordAttempt } from "@/lib/quiz/learn";

const Body = z.object({
  itemId: z.string().uuid(),
  mode: z.enum(["daily", "free", "review"]),
  answer: z.string().max(5000).optional(),
  self: z.enum(["correct", "partial", "wrong"]).optional(),
});

/** 풀이 기록: 기입형은 서버가 채점, 서술형은 자기평가 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await recordAttempt(learner, data));
  } catch (e) {
    return jsonError(e, 400);
  }
}
