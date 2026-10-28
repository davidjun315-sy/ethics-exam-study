import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { reportAnswer } from "@/lib/quiz/learn";

const Body = z.object({ itemId: z.string().uuid(), answer: z.string().min(1).max(500) });

/** 오답 처리된 답에 대한 검수 요청 (관리자가 정답으로 인정할 수 있음) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await reportAnswer(learner, data.itemId, data.answer);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
