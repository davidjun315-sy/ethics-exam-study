import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { getDailySession, getPracticeSession } from "@/lib/quiz/learn";

const Body = z.object({
  mode: z.enum(["daily", "free", "review"]),
  filters: z
    .object({
      area: z.string().max(50).optional(),
      philosopher: z.string().max(100).optional(),
      year: z.number().int().optional(),
      kind: z.enum(["exam", "expected"]).optional(),
      format: z.enum(["fill", "essay"]).optional(),
      difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      which: z.enum(["any", "new", "review"]).optional(),
    })
    .optional(),
});

/** 학습 세션: 오늘의 미션(이어 풀기 포함) / 자유 학습 / 오답 복습 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const session = data.mode === "daily" ? await getDailySession(learner) : await getPracticeSession(learner, data.mode, data.filters ?? {});
    return NextResponse.json(session);
  } catch (e) {
    return jsonError(e);
  }
}
