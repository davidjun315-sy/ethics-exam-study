import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setQuestionScope } from "@/lib/quiz/learn";

const Body = z.object({ scope: z.enum(["exam", "expected", "both"]) });

/** 출제 범위 설정·변경 (기출문제 / AI 예상문제 / 기출문제+AI 예상문제) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setQuestionScope(learner, data.scope);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
